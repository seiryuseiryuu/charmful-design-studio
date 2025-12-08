import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.86.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const YOUTUBE_API_KEY = Deno.env.get('YOUTUBE_API_KEY');
    if (!YOUTUBE_API_KEY) {
      throw new Error('YOUTUBE_API_KEY is not configured');
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Authorization header is required');
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    const { channelUrl, channelId } = await req.json();

    // Extract channel ID or handle from URL
    let youtubeChannelId = '';
    let channelHandle = '';
    
    if (channelUrl.includes('/channel/')) {
      youtubeChannelId = channelUrl.split('/channel/')[1].split('/')[0].split('?')[0];
    } else if (channelUrl.includes('/@')) {
      channelHandle = channelUrl.split('/@')[1].split('/')[0].split('?')[0];
    } else if (channelUrl.includes('/c/')) {
      channelHandle = channelUrl.split('/c/')[1].split('/')[0].split('?')[0];
    } else if (channelUrl.includes('/user/')) {
      channelHandle = channelUrl.split('/user/')[1].split('/')[0].split('?')[0];
    }

    console.log('Extracted:', { youtubeChannelId, channelHandle, channelUrl });

    // If we have a handle, resolve it to channel ID
    if (channelHandle && !youtubeChannelId) {
      const searchResponse = await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent(channelHandle)}&key=${YOUTUBE_API_KEY}`
      );
      const searchData = await searchResponse.json();
      
      if (searchData.items && searchData.items.length > 0) {
        youtubeChannelId = searchData.items[0].snippet.channelId;
      } else {
        // Try channels endpoint with forHandle
        const channelResponse = await fetch(
          `https://www.googleapis.com/youtube/v3/channels?part=id&forHandle=${channelHandle}&key=${YOUTUBE_API_KEY}`
        );
        const channelData = await channelResponse.json();
        if (channelData.items && channelData.items.length > 0) {
          youtubeChannelId = channelData.items[0].id;
        }
      }
    }

    if (!youtubeChannelId) {
      throw new Error('Could not find YouTube channel');
    }

    console.log('Found channel ID:', youtubeChannelId);

    // Get uploads playlist ID
    const channelResponse = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${youtubeChannelId}&key=${YOUTUBE_API_KEY}`
    );
    const channelData = await channelResponse.json();

    if (!channelData.items || channelData.items.length === 0) {
      throw new Error('Channel not found');
    }

    const uploadsPlaylistId = channelData.items[0].contentDetails.relatedPlaylists.uploads;

    // Get latest videos from uploads playlist
    const playlistResponse = await fetch(
      `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${uploadsPlaylistId}&maxResults=20&key=${YOUTUBE_API_KEY}`
    );
    const playlistData = await playlistResponse.json();

    if (!playlistData.items) {
      throw new Error('No videos found');
    }

    console.log(`Found ${playlistData.items.length} videos`);

    // Process and save thumbnails
    const thumbnails = [];
    for (const item of playlistData.items) {
      const videoId = item.snippet.resourceId.videoId;
      const thumbnailUrl = item.snippet.thumbnails.maxres?.url 
        || item.snippet.thumbnails.high?.url 
        || item.snippet.thumbnails.medium?.url
        || item.snippet.thumbnails.default?.url;

      if (thumbnailUrl) {
        thumbnails.push({
          user_id: user.id,
          channel_id: channelId,
          video_id: videoId,
          video_title: item.snippet.title,
          thumbnail_url: thumbnailUrl,
          published_at: item.snippet.publishedAt,
        });
      }
    }

    // Upsert thumbnails (ignore conflicts)
    if (thumbnails.length > 0) {
      const { error: insertError } = await supabase
        .from('channel_thumbnails')
        .upsert(thumbnails, { onConflict: 'channel_id,video_id', ignoreDuplicates: true });

      if (insertError) {
        console.error('Insert error:', insertError);
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        count: thumbnails.length,
        thumbnails: thumbnails.map(t => ({
          videoId: t.video_id,
          title: t.video_title,
          thumbnailUrl: t.thumbnail_url,
        }))
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Fetch thumbnails error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
