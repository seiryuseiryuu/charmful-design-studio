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
    const { messages, imageUrls } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const systemPrompt = `あなたはYouTubeサムネイル作成のプロフェッショナルアシスタントです。
ユーザーがサムネイルのアイデアを相談してきたら、以下のポイントを考慮してアドバイスしてください：

1. **視覚的インパクト**: 目を引く色使い、コントラスト、配置
2. **テキストの効果**: 読みやすく、興味を引くキャッチコピー
3. **感情の訴求**: 視聴者の好奇心や感情を刺激する要素
4. **ブランド一貫性**: チャンネルのスタイルとの統一感
5. **トレンド**: 現在人気のあるサムネイルスタイル

具体的で実践的なアドバイスを日本語で提供してください。マークダウン記法を使って見やすく整理してください。
ユーザーが画像生成を希望したら、Google Gemini画像生成用の詳細なプロンプトを英語で作成してください。`;

    // Build message content - support for image analysis
    let processedMessages = messages.map((msg: any) => {
      // If it's a user message and we have imageUrls to include
      if (msg.role === 'user' && imageUrls && Array.isArray(imageUrls) && imageUrls.length > 0) {
        const content: any[] = [];
        
        // Add images first
        for (const imgUrl of imageUrls) {
          if (imgUrl && typeof imgUrl === 'string') {
            content.push({
              type: 'image_url',
              image_url: { url: imgUrl },
            });
          }
        }
        
        // Add text content
        content.push({
          type: 'text',
          text: msg.content,
        });
        
        return { role: msg.role, content };
      }
      return msg;
    });

    console.log(`Processing chat with ${imageUrls?.length || 0} images`);

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          ...processedMessages,
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'レート制限に達しました。しばらくお待ちください。' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'クレジットが不足しています。' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const errorText = await response.text();
      console.error('AI Gateway error:', response.status, errorText);
      throw new Error('AI Gateway error');
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || 'すみません、応答を生成できませんでした。';

    return new Response(
      JSON.stringify({ content }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Chat function error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
