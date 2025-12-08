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
    const { 
      prompt, 
      referenceImages, 
      assetCount = 0, 
      ownChannelCount = 0, 
      competitorCount = 0, 
      editMode = false, 
      originalImage = null,
      modelImage = null,
      preserveModelPerson = false
    } = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    if (!prompt) {
      throw new Error('Prompt is required');
    }

    // Build message content with optional reference images
    const messageContent: any[] = [];

    // 人物保持モードまたは編集モードの場合、ベース画像を最初に追加
    // これにより画像編集として処理され、人物が保持される
    const shouldUseEditMode = editMode || preserveModelPerson;
    const baseImage = originalImage || modelImage;

    if (shouldUseEditMode && baseImage) {
      console.log('Using edit mode for person preservation. Base image provided.');
      messageContent.push({
        type: 'image_url',
        image_url: {
          url: baseImage,
        },
      });
    }

    // Add reference images if provided (skip duplicates with base image)
    // Limit to 3 reference images to prevent context overflow
    const maxReferenceImages = 3;
    if (referenceImages && Array.isArray(referenceImages) && referenceImages.length > 0) {
      const limitedRefs = referenceImages.slice(0, maxReferenceImages);
      console.log(`Including ${limitedRefs.length} reference images (limited from ${referenceImages.length}, assets: ${assetCount}, own channel: ${ownChannelCount}, competitor: ${competitorCount})`);
      
      for (const imageUrl of limitedRefs) {
        // ベース画像と重複する場合はスキップ
        if (imageUrl && typeof imageUrl === 'string' && imageUrl !== baseImage) {
          messageContent.push({
            type: 'image_url',
            image_url: {
              url: imageUrl,
            },
          });
        }
      }
    }

    // プロンプト構築
    let enhancedPrompt: string;

    if (preserveModelPerson && baseImage) {
      // 人物保持モード: 最も厳格な指示
      enhancedPrompt = `【画像編集タスク - 人物保持必須】

あなたは既存の画像を編集しています。最初に提供された画像がベース画像です。

【絶対厳守ルール - 人物の完全保持】
1. ベース画像に含まれる人物の「顔」「体型」「髪型」「肌の色」「服装」を100%そのまま維持すること
2. 人物の表情、ポーズ、向き、位置を一切変更しないこと
3. 新しい人物を絶対に追加しないこと
4. 人物を絶対に削除しないこと
5. 人物の見た目を少しでも変更することは禁止

【許可される編集】
- 背景の調整
- テキスト・文字の追加/変更
- 色調・明るさの調整（人物の肌色は維持）
- エフェクトの追加

【出力仕様】
- アスペクト比: 16:9 (1280x720)
- 元画像の人物が「完全に同一人物」として認識できること

【ユーザーの指示】
${prompt}

CRITICAL: 出力画像の人物は、入力画像の人物と100%同一でなければなりません。別人に見えたら失敗です。`;

    } else if (editMode && originalImage) {
      // 通常の編集モード
      enhancedPrompt = `You are editing an existing YouTube thumbnail image. The FIRST image provided is the ORIGINAL thumbnail that needs modification.

CRITICAL EDITING RULES:
1. ONLY modify the specific elements mentioned in the user's request
2. PRESERVE EVERYTHING ELSE EXACTLY AS IT IS in the original image:
   - Keep the same background if not mentioned
   - Keep the same person/face if not mentioned
   - Keep the same colors if not mentioned
   - Keep the same layout/composition if not mentioned
   - Keep the same text position and style if not mentioned
3. The output should look like a minor edit of the original, NOT a completely new image
4. Maintain the exact same aspect ratio (16:9, 1280x720)

User's modification request: ${prompt}

Remember: ONLY change what the user specifically asked to change. Everything else must remain IDENTICAL to the original image.`;

    } else if (referenceImages && referenceImages.length > 0) {
      // 参照画像ありの新規生成
      const assetNote = assetCount > 0
        ? `
CRITICAL - Registered Channel Assets (HIGHEST PRIORITY):
- The first ${assetCount} reference image(s) are registered channel assets
- These include the channel's main person(s), characters, and icons
- You MUST use these people/characters EXACTLY as they appear
- Match their: face shape, facial features, hair style, skin tone, clothing style, and overall appearance PERFECTLY
`
        : '';

      const ownChannelNote = ownChannelCount > 0
        ? `
Own Channel Thumbnails (${ownChannelCount} images after assets):
- These are from the creator's OWN channel
- Use the SAME PERSON who appears in these thumbnails
- Match their face, appearance, and style consistently
`
        : '';

      const competitorNote = competitorCount > 0
        ? `
Competitor Channel Thumbnails (${competitorCount} images at the end):
- These are from COMPETITOR channels - for STYLE REFERENCE ONLY
- DO NOT copy or use any people/faces from these images
- ONLY reference: layout, composition, color schemes, visual effects, typography style
`
        : '';

      enhancedPrompt = `You are a professional YouTube thumbnail designer. Study the reference images provided carefully.
${assetNote}${ownChannelNote}${competitorNote}
CRITICAL - COMPOSITION AND LAYOUT ADHERENCE:
- You MUST follow the EXACT same composition and layout as the reference thumbnails
- Copy the EXACT positioning: where text is placed, where people are positioned, background arrangement
- Match the visual hierarchy and element placement PRECISELY

Based on these references, create a NEW YouTube thumbnail with these specifications:
- Aspect ratio: 16:9 (1280x720)
- Main content/theme: ${prompt}
- COPY the EXACT composition, layout, and element positioning from reference thumbnails
- Style: Match the visual style, energy, and color palette of the reference thumbnails
- Make it eye-catching, high contrast, and professional

CRITICAL TEXT RULES:
- Do NOT include long text or full video titles on the thumbnail
- Text should be minimal: 1-3 impactful words MAXIMUM
- Use short, punchy keywords or emotional phrases only

IMPORTANT: 
- The person(s) from registered assets or own channel must be the MAIN focus
- Their face must be clearly visible and recognizable
- Position people in the SAME location as in reference thumbnails
- DO NOT use faces from competitor thumbnails - only use their style/composition`;

    } else {
      // 参照なしの新規生成
      enhancedPrompt = `Create a professional YouTube thumbnail image in 16:9 aspect ratio (1280x720). 
Theme: ${prompt}. 
Style: High contrast, vibrant colors, eye-catching design suitable for YouTube. 
Make it visually striking and attention-grabbing. Wide landscape format.
CRITICAL: Do NOT put long text or video titles on the thumbnail. Use minimal text only - 1-3 impactful words maximum.`;
    }

    // Add the text prompt
    messageContent.push({
      type: 'text',
      text: enhancedPrompt,
    });

    console.log('=== Generate Image Request ===');
    console.log('Edit mode:', editMode);
    console.log('Preserve model person:', preserveModelPerson);
    console.log('Has base image:', !!baseImage);
    console.log('Reference count:', referenceImages?.length || 0);
    console.log('Using edit approach:', shouldUseEditMode);

    // Retry logic for image generation
    const maxRetries = 2;
    let lastError: Error | null = null;
    let imageUrl: string | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (attempt > 0) {
        console.log(`Retry attempt ${attempt}/${maxRetries}`);
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-3-pro-image-preview',
          messages: [
            {
              role: 'user',
              content: messageContent,
            },
          ],
          modalities: ['image', 'text'],
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
        lastError = new Error('AI Gateway error');
        continue;
      }

      const data = await response.json();
      console.log('AI Gateway response received');

      // Extract image URL from the response
      imageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;

      if (imageUrl) {
        console.log('Image generated successfully');
        break;
      } else {
        console.error(`Attempt ${attempt + 1}: No image URL in response:`, JSON.stringify(data).substring(0, 500));
        lastError = new Error('画像の生成に失敗しました');
      }
    }

    if (!imageUrl) {
      throw lastError || new Error('画像の生成に失敗しました');
    }

    return new Response(
      JSON.stringify({ imageUrl }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Image generation error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
