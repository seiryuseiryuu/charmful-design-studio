import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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

    const { channelUrl } = await req.json();

    if (!channelUrl) {
      throw new Error('Channel URL is required');
    }

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
      // Try channels endpoint with forHandle first
      const channelResponse = await fetch(
        `https://www.googleapis.com/youtube/v3/channels?part=id,snippet&forHandle=${channelHandle}&key=${YOUTUBE_API_KEY}`
      );
      const channelData = await channelResponse.json();
      
      if (channelData.items && channelData.items.length > 0) {
        const item = channelData.items[0];
        return new Response(
          JSON.stringify({
            success: true,
            channelId: item.id,
            channelName: item.snippet.title,
            channelIcon: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.default?.url,
            description: item.snippet.description,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      // Fallback to search
      const searchResponse = await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent(channelHandle)}&key=${YOUTUBE_API_KEY}`
      );
      const searchData = await searchResponse.json();
      
      if (searchData.items && searchData.items.length > 0) {
        youtubeChannelId = searchData.items[0].snippet.channelId;
      }
    }

    if (!youtubeChannelId) {
      throw new Error('Could not find YouTube channel');
    }

    console.log('Found channel ID:', youtubeChannelId);

    // Get channel details
    const channelResponse = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?part=snippet&id=${youtubeChannelId}&key=${YOUTUBE_API_KEY}`
    );
    const channelData = await channelResponse.json();

    if (!channelData.items || channelData.items.length === 0) {
      throw new Error('Channel not found');
    }

    const channel = channelData.items[0];

    return new Response(
      JSON.stringify({
        success: true,
        channelId: youtubeChannelId,
        channelName: channel.snippet.title,
        channelIcon: channel.snippet.thumbnails?.high?.url || channel.snippet.thumbnails?.default?.url,
        description: channel.snippet.description,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Fetch channel info error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
