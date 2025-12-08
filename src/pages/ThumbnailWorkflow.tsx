import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import {
  ArrowRight,
  ArrowLeft,
  Check,
  Loader2,
  Sparkles,
  RefreshCw,
  Download,
  Wand2,
  Type,
  Camera,
  LayoutGrid,
  Upload,
  Lightbulb,
  Eye,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface ChannelThumbnail {
  id: string;
  video_id: string;
  video_title: string;
  thumbnail_url: string;
  channel_name?: string;
  channel_type?: string;
}

interface Channel {
  id: string;
  channel_name: string;
  channel_url: string | null;
  channel_type: string;
}

interface MaterialItem {
  id: string;
  file: File;
  preview: string;
  description: string;
}

interface PatternAnalysis {
  textPosition: string;
  colorScheme: string;
  personPosition: string;
  layout: string;
  effects: string;
}

interface WorkflowState {
  step: number;
  selectedReferences: ChannelThumbnail[];
  videoTitle: string;
  videoDescription: string;
  text: string;
  materials: MaterialItem[];
  generatedImages: string[];
  isABTest: boolean;
  patternAnalysis: PatternAnalysis | null;
  modelImages: string[];
}

interface TextSuggestion {
  text: string;
  reason: string;
}

interface MaterialSuggestion {
  type: string;
  description: string;
  examples: string[];
}

interface ChannelAsset {
  id: string;
  name: string;
  asset_type: 'self' | 'member' | 'character' | 'channel_icon' | 'other';
  image_url: string;
  description: string | null;
}

export default function ThumbnailWorkflow() {
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [channels, setChannels] = useState<Channel[]>([]);
  const [thumbnails, setThumbnails] = useState<ChannelThumbnail[]>([]);
  const [isLoadingThumbnails, setIsLoadingThumbnails] = useState(false);
  const [isFetchingFromYouTube, setIsFetchingFromYouTube] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingModels, setIsGeneratingModels] = useState(false);
  
  const [workflow, setWorkflow] = useState<WorkflowState>({
    step: 1,
    selectedReferences: [],
    videoTitle: '',
    videoDescription: '',
    text: '',
    materials: [],
    generatedImages: [],
    isABTest: false,
    patternAnalysis: null,
    modelImages: [],
  });

  const [textSuggestions, setTextSuggestions] = useState<TextSuggestion[]>([]);
  const [materialSuggestions, setMaterialSuggestions] = useState<MaterialSuggestion[]>([]);
  const [isGeneratingSuggestions, setIsGeneratingSuggestions] = useState(false);
  const [channelAssets, setChannelAssets] = useState<ChannelAsset[]>([]);

  useEffect(() => {
    fetchChannels();
    fetchStoredThumbnails();
    fetchChannelAssets();
  }, [user]);

  const fetchChannelAssets = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('channel_assets')
      .select('*')
      .eq('user_id', user.id);
    setChannelAssets(data || []);
  };

  const fetchChannels = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('channel_settings')
      .select('*')
      .eq('user_id', user.id);
    setChannels((data || []) as Channel[]);
  };

  const fetchStoredThumbnails = async () => {
    if (!user) return;
    setIsLoadingThumbnails(true);
    
    const { data: channelsData } = await supabase
      .from('channel_settings')
      .select('id, channel_name, channel_type')
      .eq('user_id', user.id);

    if (channelsData) {
      const allThumbnails: ChannelThumbnail[] = [];
      
      for (const channel of channelsData) {
        const { data: thumbs } = await supabase
          .from('channel_thumbnails')
          .select('*')
          .eq('channel_id', channel.id)
          .order('published_at', { ascending: false })
          .limit(20);
        
        if (thumbs) {
          allThumbnails.push(...thumbs.map(t => ({
            ...t,
            channel_name: channel.channel_name,
            channel_type: channel.channel_type,
          })));
        }
      }
      
      setThumbnails(allThumbnails);
    }
    setIsLoadingThumbnails(false);
  };

  const fetchYouTubeThumbnails = async (channelId: string) => {
    setIsFetchingFromYouTube(true);
    try {
      const channel = channels.find(c => c.id === channelId);
      if (!channel?.channel_url) {
        toast({ title: 'エラー', description: 'チャンネルURLが設定されていません', variant: 'destructive' });
        return;
      }

      const { data, error } = await supabase.functions.invoke('fetch-youtube-thumbnails', {
        body: { channelUrl: channel.channel_url, channelId },
      });

      if (error) throw error;
      
      toast({ title: '取得完了', description: `${data.count}件のサムネイルを取得しました` });
      fetchStoredThumbnails();
    } catch (error) {
      console.error('Fetch error:', error);
      toast({ title: 'エラー', description: 'サムネイルの取得に失敗しました', variant: 'destructive' });
    } finally {
      setIsFetchingFromYouTube(false);
    }
  };

  const toggleReferenceSelection = (thumbnail: ChannelThumbnail) => {
    setWorkflow(prev => {
      const isSelected = prev.selectedReferences.some(t => t.id === thumbnail.id);
      if (isSelected) {
        return { ...prev, selectedReferences: prev.selectedReferences.filter(t => t.id !== thumbnail.id) };
      } else if (prev.selectedReferences.length < 10) {
        return { ...prev, selectedReferences: [...prev.selectedReferences, thumbnail] };
      }
      return prev;
    });
  };

  const analyzePatterns = async () => {
    if (workflow.selectedReferences.length === 0) {
      toast({ title: 'エラー', description: '参考サムネイルを選択してください', variant: 'destructive' });
      return;
    }

    setIsAnalyzing(true);
    try {
      const thumbnailUrls = workflow.selectedReferences.map(t => t.thumbnail_url);
      
      const { data, error } = await supabase.functions.invoke('chat', {
        body: {
          messages: [{
            role: 'user',
            content: `以下の${workflow.selectedReferences.length}枚のYouTubeサムネイルを分析し、共通するパターンを抽出してください。

サムネイルURL:
${thumbnailUrls.map((url, i) => `${i + 1}. ${url}`).join('\n')}

以下のJSON形式で回答してください:
{
  "textPosition": "テロップ・文字の配置パターン（例：中央配置、右寄せ、上部配置など）",
  "colorScheme": "使われている配色パターン（例：赤×黄色、青×白、暖色系グラデーションなど）",
  "personPosition": "人物の配置パターン（例：右側に大きく配置、中央配置、左1/3配置など）",
  "layout": "全体的なレイアウトパターン（例：Z型構図、三分割法、対角線構図など）",
  "effects": "使われている視覚効果（例：光彩効果、吹き出し、矢印、枠線など）"
}`
          }],
        },
      });

      if (error) throw error;

      try {
        const jsonMatch = data.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          setWorkflow(prev => ({ ...prev, patternAnalysis: parsed }));
        }
      } catch (parseError) {
        console.error('Parse error:', parseError);
        toast({ title: 'エラー', description: 'パターン分析に失敗しました', variant: 'destructive' });
      }
    } catch (error) {
      console.error('Analysis error:', error);
      toast({ title: 'エラー', description: 'パターン分析に失敗しました', variant: 'destructive' });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const generateModelImages = async () => {
    if (!workflow.patternAnalysis) {
      toast({ title: 'エラー', description: 'まずパターン分析を実行してください', variant: 'destructive' });
      return;
    }

    setIsGeneratingModels(true);
    setWorkflow(prev => ({ ...prev, modelImages: [] }));
    
    try {
      const pattern = workflow.patternAnalysis;
      const referenceImages = workflow.selectedReferences.map(t => t.thumbnail_url);
      
      const modelPromises = [1, 2, 3].map(async (num) => {
        const prompt = `YouTubeサムネイルのモデル画像を生成してください。

【パターン分析結果を厳密に適用】
- テロップ配置: ${pattern.textPosition}
- 配色: ${pattern.colorScheme}
- 人物配置: ${pattern.personPosition}
- レイアウト: ${pattern.layout}
- 視覚効果: ${pattern.effects}

パターン${num}として、上記の分析結果に基づいたサムネイルのモデル画像を生成してください。
テキストは「サンプル」「SAMPLE」などのダミーテキストを使用してください。
アスペクト比は16:9（1280x720）で生成してください。`;

        const { data, error } = await supabase.functions.invoke('generate-image', {
          body: { 
            prompt,
            referenceImages: referenceImages.slice(0, 5),
            assetCount: 0,
            ownChannelCount: 0,
            competitorCount: referenceImages.length,
          },
        });

        if (error) throw error;
        return data.imageUrl;
      });

      const results = await Promise.all(modelPromises);
      setWorkflow(prev => ({ ...prev, modelImages: results.filter(Boolean) }));
      toast({ title: '生成完了', description: 'モデル画像を3枚生成しました' });
    } catch (error) {
      console.error('Model generation error:', error);
      toast({ title: 'エラー', description: 'モデル画像の生成に失敗しました', variant: 'destructive' });
    } finally {
      setIsGeneratingModels(false);
    }
  };

  const generateSuggestionsFromTitle = async () => {
    if (!workflow.videoTitle.trim()) {
      toast({ title: 'タイトルを入力', description: '動画タイトルを入力してください', variant: 'destructive' });
      return;
    }

    setIsGeneratingSuggestions(true);
    try {
      const referenceInfo = workflow.selectedReferences.map(t => ({
        title: t.video_title,
        channelType: t.channel_type === 'own' ? '自チャンネル' : '競合チャンネル',
      }));

      const { data, error } = await supabase.functions.invoke('chat', {
        body: {
          messages: [{
            role: 'user',
            content: `あなたは視聴者の心を掴むYouTubeサムネイルのコピーライターです。以下の動画から、クリックしたくなる強力なキーワードを提案してください。

動画タイトル: 「${workflow.videoTitle}」
${workflow.videoDescription ? `動画内容: ${workflow.videoDescription}` : ''}

${referenceInfo.length > 0 ? `参考サムネイル:\n${referenceInfo.map((r, i) => `${i + 1}. "${r.title}" (${r.channelType})`).join('\n')}\n` : ''}

以下のJSON形式で回答してください（必ずこの形式で）:
{
  "textSuggestions": [
    {"text": "キーワード1", "reason": "なぜクリックされるか"},
    {"text": "キーワード2", "reason": "なぜクリックされるか"},
    {"text": "キーワード3", "reason": "なぜクリックされるか"}
  ],
  "materialSuggestions": [
    {"type": "素材", "description": "AIでは生成が難しい素材の説明", "examples": []}
  ]
}

【重要ルール】
1. 文言は2〜6文字の超短いパワーワード（例: 「衝撃」「神回」「ヤバすぎ」「最強」「禁断」「激変」「限界突破」）
2. 感情を刺激する言葉を使う（驚き、好奇心、緊急性、独占感）
3. 数字があれば活用（「100万」「1位」「99%」など）
4. 疑問形や煽り表現も効果的（「なぜ？」「マジか」「嘘だろ」）
5. 素材提案はAI画像生成では作れないものだけ（実写の本人写真、特定の商品など）`
          }],
        },
      });

      if (error) throw error;
      
      try {
        const jsonMatch = data.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          setTextSuggestions(parsed.textSuggestions || []);
          setMaterialSuggestions(parsed.materialSuggestions || []);
        }
      } catch (parseError) {
        console.error('Parse error:', parseError);
      }
    } catch (error) {
      console.error('Suggestion error:', error);
      toast({ title: 'エラー', description: '提案の生成に失敗しました', variant: 'destructive' });
    } finally {
      setIsGeneratingSuggestions(false);
    }
  };

  const proceedToStep2 = () => {
    if (workflow.selectedReferences.length === 0) {
      toast({ title: '参考を選択', description: '参考サムネイルを選択してください', variant: 'destructive' });
      return;
    }
    setWorkflow(prev => ({ ...prev, step: 2 }));
  };

  const proceedToStep3 = () => {
    if (!workflow.patternAnalysis) {
      toast({ title: 'パターン分析が必要', description: 'パターン分析を実行してください', variant: 'destructive' });
      return;
    }
    setWorkflow(prev => ({ ...prev, step: 3 }));
  };

  const proceedToStep4 = () => {
    if (!workflow.videoTitle.trim()) {
      toast({ title: 'タイトルを入力', description: '動画タイトルを入力してください', variant: 'destructive' });
      return;
    }
    setWorkflow(prev => ({ ...prev, step: 4 }));
  };

  const proceedToStep5 = () => {
    if (!workflow.text.trim()) {
      toast({ title: '文言を入力', description: 'サムネイルの文言を入力してください', variant: 'destructive' });
      return;
    }
    setWorkflow(prev => ({ ...prev, step: 5 }));
  };

  const proceedToStep6 = () => {
    setWorkflow(prev => ({ ...prev, step: 6 }));
  };

  const handleMaterialUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newMaterials: MaterialItem[] = [];
    for (const file of Array.from(files)) {
      newMaterials.push({
        id: crypto.randomUUID(),
        file,
        preview: URL.createObjectURL(file),
        description: '',
      });
    }

    setWorkflow(prev => ({
      ...prev,
      materials: [...prev.materials, ...newMaterials],
    }));
  };

  const removeMaterial = (id: string) => {
    setWorkflow(prev => ({
      ...prev,
      materials: prev.materials.filter(m => m.id !== id),
    }));
  };

  const generateThumbnail = async () => {
    setIsGenerating(true);
    try {
      const ownChannelRefs = workflow.selectedReferences.filter(t => t.channel_type === 'own');
      const competitorRefs = workflow.selectedReferences.filter(t => t.channel_type !== 'own');
      
      const selfAssets = channelAssets.filter(a => a.asset_type === 'self');
      const memberAssets = channelAssets.filter(a => a.asset_type === 'member');
      const characterAssets = channelAssets.filter(a => a.asset_type === 'character');
      
      const registeredAssetsInfo = channelAssets.length > 0
        ? `\n\n【登録済み素材（必ず参照）】\n${selfAssets.map(a => `- 自分「${a.name}」${a.description ? `: ${a.description}` : ''}`).join('\n')}${memberAssets.length > 0 ? '\n' + memberAssets.map(a => `- メンバー「${a.name}」${a.description ? `: ${a.description}` : ''}`).join('\n') : ''}${characterAssets.length > 0 ? '\n' + characterAssets.map(a => `- キャラクター「${a.name}」${a.description ? `: ${a.description}` : ''}`).join('\n') : ''}`
        : '';

      const patternInfo = workflow.patternAnalysis
        ? `\n\n【適用するパターン】
- テロップ配置: ${workflow.patternAnalysis.textPosition}
- 配色: ${workflow.patternAnalysis.colorScheme}
- 人物配置: ${workflow.patternAnalysis.personPosition}
- レイアウト: ${workflow.patternAnalysis.layout}
- 視覚効果: ${workflow.patternAnalysis.effects}`
        : '';
      
      const materialDescText = workflow.materials.length > 0 
        ? `\n使用素材: ${workflow.materials.map(m => m.description || '素材').join('、')}`
        : '';
      
      const personInfo = selfAssets.length > 0
        ? `\n登場人物: 登録された「自分」の画像に写っている人物をメインキャラクターとして使用してください。`
        : ownChannelRefs.length > 0
        ? `\n登場人物: 参考サムネイル（自チャンネル${ownChannelRefs.length}枚）に登場する人物と同じ人物を使用してください。`
        : '';
      
      const competitorInfo = competitorRefs.length > 0
        ? `\n\n【競合チャンネルの参考サムネイル（${competitorRefs.length}枚）】\nスタイル、構図、色使いなど視覚的な要素のみを参考にしてください。`
        : '';
      
      const prompt = `動画タイトル「${workflow.videoTitle}」のYouTubeサムネイル。
文言: ${workflow.text}${workflow.videoDescription ? `\n動画内容: ${workflow.videoDescription}` : ''}${personInfo}${registeredAssetsInfo}${patternInfo}${competitorInfo}${materialDescText}`;

      const assetImages = channelAssets.map(a => a.image_url);
      const ownChannelImages = ownChannelRefs.map(t => t.thumbnail_url);
      const competitorImages = competitorRefs.map(t => t.thumbnail_url);
      const allReferenceImages = [...assetImages, ...ownChannelImages, ...competitorImages];

      const { data, error } = await supabase.functions.invoke('generate-image', {
        body: { 
          prompt,
          referenceImages: allReferenceImages,
          assetCount: assetImages.length,
          ownChannelCount: ownChannelImages.length,
          competitorCount: competitorImages.length,
        },
      });

      if (error) throw error;
      
      if (data.imageUrl) {
        setWorkflow(prev => ({ 
          ...prev, 
          generatedImages: [...prev.generatedImages, data.imageUrl] 
        }));
        
        await supabase.from('thumbnails').insert({
          user_id: user!.id,
          image_url: data.imageUrl,
          prompt,
          title: workflow.text.slice(0, 100),
        });

        toast({ title: '生成完了', description: 'サムネイルが生成されました' });
      }
    } catch (error) {
      console.error('Generate error:', error);
      toast({ title: 'エラー', description: '画像生成に失敗しました', variant: 'destructive' });
    } finally {
      setIsGenerating(false);
    }
  };

  const resetWorkflow = () => {
    setWorkflow({
      step: 1,
      selectedReferences: [],
      videoTitle: '',
      videoDescription: '',
      text: '',
      materials: [],
      generatedImages: [],
      isABTest: false,
      patternAnalysis: null,
      modelImages: [],
    });
    setTextSuggestions([]);
    setMaterialSuggestions([]);
  };

  const downloadImage = async (url: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `thumbnail-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch {
      window.open(url, '_blank');
    }
  };

  const ownThumbnails = thumbnails.filter(t => t.channel_type === 'own');
  const competitorThumbnails = thumbnails.filter(t => t.channel_type === 'competitor');

  const steps = [
    { num: 1, title: '参考選択', icon: LayoutGrid },
    { num: 2, title: 'パターン分析', icon: Eye },
    { num: 3, title: 'モデル生成', icon: Sparkles },
    { num: 4, title: 'タイトル入力', icon: Type },
    { num: 5, title: '文言決定', icon: Lightbulb },
    { num: 6, title: 'AI生成', icon: Wand2 },
  ];

  return (
    <div className="min-h-[calc(100vh-3.5rem)] p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <Sparkles className="w-8 h-8 text-primary" />
              サムネイル制作ワークフロー
            </h1>
            <p className="text-muted-foreground mt-1">
              参考動画からパターンを分析してサムネイルを作成
            </p>
          </div>
          <Button variant="outline" onClick={resetWorkflow}>
            <RefreshCw className="w-4 h-4 mr-2" />
            リセット
          </Button>
        </div>

        {/* Step Progress */}
        <div className="flex items-center justify-between px-2 overflow-x-auto">
          {steps.map((step, index) => (
            <div key={step.num} className="flex items-center shrink-0">
              <div className={`flex items-center gap-1 ${workflow.step >= step.num ? 'text-primary' : 'text-muted-foreground'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  workflow.step > step.num ? 'bg-primary text-primary-foreground' :
                  workflow.step === step.num ? 'bg-primary/20 text-primary border-2 border-primary' :
                  'bg-secondary text-muted-foreground'
                }`}>
                  {workflow.step > step.num ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    <step.icon className="w-4 h-4" />
                  )}
                </div>
                <span className="text-xs font-medium hidden md:block">{step.title}</span>
              </div>
              {index < steps.length - 1 && (
                <div className={`w-6 h-0.5 mx-1 ${workflow.step > step.num ? 'bg-primary' : 'bg-border'}`} />
              )}
            </div>
          ))}
        </div>

        {/* Step Content */}
        <div className="space-y-6">
          {/* Step 1: Reference Selection */}
          {workflow.step === 1 && (
            <Card className="glass">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <LayoutGrid className="w-5 h-5 text-primary" />
                  Step 1: 参考サムネイルを選択（最大10枚）
                </CardTitle>
                <CardDescription>
                  自分のチャンネルと競合チャンネルから参考にしたいサムネイルを選んでください
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Tabs defaultValue="own" className="w-full">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="own">自分のチャンネル ({ownThumbnails.length})</TabsTrigger>
                    <TabsTrigger value="competitor">競合チャンネル ({competitorThumbnails.length})</TabsTrigger>
                  </TabsList>
                  <TabsContent value="own" className="mt-4">
                    {ownThumbnails.length === 0 ? (
                      <p className="text-center text-muted-foreground py-8">
                        サムネイルがありません。チャンネル設定からYouTubeサムネイルを取得してください。
                      </p>
                    ) : (
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                        {ownThumbnails.map(thumb => (
                          <div
                            key={thumb.id}
                            onClick={() => toggleReferenceSelection(thumb)}
                            className={`relative cursor-pointer rounded-lg overflow-hidden border-2 transition-all ${
                              workflow.selectedReferences.some(t => t.id === thumb.id)
                                ? 'border-primary ring-2 ring-primary/20'
                                : 'border-transparent hover:border-primary/50'
                            }`}
                          >
                            <img src={thumb.thumbnail_url} alt={thumb.video_title} className="aspect-video object-cover" />
                            <Badge className="absolute bottom-1 left-1 text-xs bg-blue-500/80">自分</Badge>
                            {workflow.selectedReferences.some(t => t.id === thumb.id) && (
                              <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                                <Check className="w-3 h-3 text-primary-foreground" />
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </TabsContent>
                  <TabsContent value="competitor" className="mt-4">
                    {competitorThumbnails.length === 0 ? (
                      <p className="text-center text-muted-foreground py-8">
                        競合サムネイルがありません。チャンネル設定から競合チャンネルを追加してください。
                      </p>
                    ) : (
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                        {competitorThumbnails.map(thumb => (
                          <div
                            key={thumb.id}
                            onClick={() => toggleReferenceSelection(thumb)}
                            className={`relative cursor-pointer rounded-lg overflow-hidden border-2 transition-all ${
                              workflow.selectedReferences.some(t => t.id === thumb.id)
                                ? 'border-primary ring-2 ring-primary/20'
                                : 'border-transparent hover:border-primary/50'
                            }`}
                          >
                            <img src={thumb.thumbnail_url} alt={thumb.video_title} className="aspect-video object-cover" />
                            <Badge className="absolute bottom-1 left-1 text-xs bg-orange-500/80">競合</Badge>
                            {workflow.selectedReferences.some(t => t.id === thumb.id) && (
                              <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                                <Check className="w-3 h-3 text-primary-foreground" />
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </TabsContent>
                </Tabs>

                <div className="flex items-center justify-between pt-4">
                  <span className="text-sm text-muted-foreground">
                    {workflow.selectedReferences.length}/10 選択中
                  </span>
                  <Button onClick={proceedToStep2} disabled={workflow.selectedReferences.length === 0} className="gradient-primary">
                    次へ
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 2: Pattern Analysis */}
          {workflow.step === 2 && (
            <Card className="glass">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Eye className="w-5 h-5 text-primary" />
                  Step 2: パターン分析
                </CardTitle>
                <CardDescription>
                  選択した{workflow.selectedReferences.length}枚のサムネイルからパターンを抽出します
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-5 gap-2">
                  {workflow.selectedReferences.map(thumb => (
                    <img 
                      key={thumb.id} 
                      src={thumb.thumbnail_url} 
                      alt={thumb.video_title} 
                      className="aspect-video object-cover rounded-lg"
                    />
                  ))}
                </div>

                <Button 
                  onClick={analyzePatterns} 
                  disabled={isAnalyzing}
                  className="w-full gradient-primary"
                >
                  {isAnalyzing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      分析中...
                    </>
                  ) : (
                    <>
                      <Eye className="w-4 h-4 mr-2" />
                      パターンを分析
                    </>
                  )}
                </Button>

                {workflow.patternAnalysis && (
                  <div className="p-4 bg-primary/5 rounded-lg border border-primary/20 space-y-3">
                    <h4 className="font-semibold flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-primary" />
                      分析結果
                    </h4>
                    <div className="grid gap-2 text-sm">
                      <div className="flex gap-2">
                        <Badge variant="secondary">テロップ配置</Badge>
                        <span>{workflow.patternAnalysis.textPosition}</span>
                      </div>
                      <div className="flex gap-2">
                        <Badge variant="secondary">配色</Badge>
                        <span>{workflow.patternAnalysis.colorScheme}</span>
                      </div>
                      <div className="flex gap-2">
                        <Badge variant="secondary">人物配置</Badge>
                        <span>{workflow.patternAnalysis.personPosition}</span>
                      </div>
                      <div className="flex gap-2">
                        <Badge variant="secondary">レイアウト</Badge>
                        <span>{workflow.patternAnalysis.layout}</span>
                      </div>
                      <div className="flex gap-2">
                        <Badge variant="secondary">視覚効果</Badge>
                        <span>{workflow.patternAnalysis.effects}</span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between pt-4">
                  <Button variant="outline" onClick={() => setWorkflow(prev => ({ ...prev, step: 1 }))}>
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    戻る
                  </Button>
                  <Button onClick={proceedToStep3} disabled={!workflow.patternAnalysis} className="gradient-primary">
                    次へ
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 3: Model Images */}
          {workflow.step === 3 && (
            <Card className="glass">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-primary" />
                  Step 3: モデル画像生成
                </CardTitle>
                <CardDescription>
                  分析したパターンに基づいてモデル画像を3枚生成します
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {workflow.patternAnalysis && (
                  <div className="p-3 bg-secondary/30 rounded-lg text-sm">
                    <p><span className="font-medium">適用パターン:</span> {workflow.patternAnalysis.layout} / {workflow.patternAnalysis.colorScheme}</p>
                  </div>
                )}

                <Button 
                  onClick={generateModelImages} 
                  disabled={isGeneratingModels}
                  className="w-full gradient-primary"
                >
                  {isGeneratingModels ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      モデル画像を生成中...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-2" />
                      モデル画像を3枚生成
                    </>
                  )}
                </Button>

                {workflow.modelImages.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="font-semibold">生成されたモデル画像</h4>
                    <div className="grid grid-cols-3 gap-3">
                      {workflow.modelImages.map((img, idx) => (
                        <div key={idx} className="relative group">
                          <img src={img} alt={`Model ${idx + 1}`} className="aspect-video object-cover rounded-lg" />
                          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                            <Button size="sm" variant="secondary" onClick={() => downloadImage(img)}>
                              <Download className="w-4 h-4" />
                            </Button>
                          </div>
                          <Badge className="absolute top-1 left-1 text-xs">パターン{idx + 1}</Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between pt-4">
                  <Button variant="outline" onClick={() => setWorkflow(prev => ({ ...prev, step: 2 }))}>
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    戻る
                  </Button>
                  <Button onClick={proceedToStep4} className="gradient-primary">
                    次へ
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 4: Video Title */}
          {workflow.step === 4 && (
            <Card className="glass">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Type className="w-5 h-5 text-primary" />
                  Step 4: 動画タイトルを入力
                </CardTitle>
                <CardDescription>
                  サムネイルを作成する動画のタイトルを入力してください
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">動画タイトル *</label>
                  <Input
                    value={workflow.videoTitle}
                    onChange={(e) => setWorkflow(prev => ({ ...prev, videoTitle: e.target.value }))}
                    placeholder="例：【衝撃】〇〇を試したら驚きの結果に..."
                    className="bg-secondary/50"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">動画の概要（任意）</label>
                  <Textarea
                    value={workflow.videoDescription}
                    onChange={(e) => setWorkflow(prev => ({ ...prev, videoDescription: e.target.value }))}
                    placeholder="動画の内容を簡単に説明してください..."
                    className="bg-secondary/50 min-h-[80px]"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Button variant="outline" onClick={() => setWorkflow(prev => ({ ...prev, step: 3 }))}>
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    戻る
                  </Button>
                  <Button onClick={proceedToStep5} disabled={!workflow.videoTitle.trim()} className="gradient-primary">
                    次へ
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 5: Text Decision */}
          {workflow.step === 5 && (
            <Card className="glass">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Lightbulb className="w-5 h-5 text-primary" />
                  Step 5: 文言を決定
                </CardTitle>
                <CardDescription>
                  サムネイルに表示するパワーワードを決めましょう
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-2">
                    サムネイル文言
                    {workflow.text && (
                      <Badge variant="secondary" className="text-xs">
                        {workflow.text.length}文字
                      </Badge>
                    )}
                  </label>
                  <div className="flex gap-2 items-start">
                    <Textarea
                      value={workflow.text}
                      onChange={(e) => setWorkflow(prev => ({ ...prev, text: e.target.value }))}
                      placeholder="例：衝撃、神回、限界突破"
                      className="min-h-[60px] bg-secondary/50 flex-1"
                    />
                    <Button
                      onClick={generateSuggestionsFromTitle}
                      disabled={!workflow.videoTitle.trim() || isGeneratingSuggestions}
                      variant="outline"
                      className="shrink-0"
                    >
                      {isGeneratingSuggestions ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Sparkles className="w-4 h-4" />
                      )}
                      <span className="ml-2">AI提案</span>
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">推奨: 2〜6文字の短いパワーワード</p>
                </div>

                {textSuggestions.length > 0 && (
                  <div className="space-y-3 p-4 bg-primary/5 rounded-lg border border-primary/20">
                    <h4 className="text-sm font-semibold flex items-center gap-2">
                      <Lightbulb className="w-4 h-4 text-yellow-500" />
                      AIの文言提案（クリックで使用）
                    </h4>
                    <div className="space-y-2">
                      {textSuggestions.map((suggestion, idx) => (
                        <button
                          key={idx}
                          onClick={() => setWorkflow(prev => ({ ...prev, text: suggestion.text }))}
                          className={`w-full text-left p-3 rounded-lg border transition-all ${
                            workflow.text === suggestion.text
                              ? 'border-primary bg-primary/10'
                              : 'border-border hover:border-primary/50 hover:bg-secondary/50'
                          }`}
                        >
                          <p className="font-bold text-lg">{suggestion.text}</p>
                          <p className="text-xs text-muted-foreground mt-1">{suggestion.reason}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between pt-4">
                  <Button variant="outline" onClick={() => setWorkflow(prev => ({ ...prev, step: 4 }))}>
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    戻る
                  </Button>
                  <Button onClick={proceedToStep6} disabled={!workflow.text.trim()} className="gradient-primary">
                    次へ
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 6: AI Generation */}
          {workflow.step === 6 && (
            <Card className="glass">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Wand2 className="w-5 h-5 text-primary" />
                  Step 6: サムネイルを生成
                </CardTitle>
                <CardDescription>
                  パターン分析結果を適用してサムネイルを生成します
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="p-4 bg-secondary/30 rounded-lg space-y-2">
                  <p className="text-sm"><span className="font-medium">動画タイトル:</span> {workflow.videoTitle}</p>
                  <p className="text-sm"><span className="font-medium">文言:</span> {workflow.text}</p>
                  <p className="text-sm"><span className="font-medium">参考サムネイル:</span> {workflow.selectedReferences.length}枚</p>
                  {workflow.patternAnalysis && (
                    <p className="text-sm"><span className="font-medium">適用パターン:</span> {workflow.patternAnalysis.layout}</p>
                  )}
                  <p className="text-sm"><span className="font-medium">登録素材:</span> {channelAssets.length}枚</p>
                </div>

                {/* Material Upload */}
                <div className="space-y-3">
                  <label className="text-sm font-medium">追加素材（任意）</label>
                  <label className="block">
                    <div className="border-2 border-dashed border-border rounded-lg p-4 text-center cursor-pointer hover:border-primary/50 transition-colors">
                      <Upload className="w-6 h-6 mx-auto text-muted-foreground mb-1" />
                      <p className="text-sm text-muted-foreground">クリックして素材をアップロード</p>
                    </div>
                    <input type="file" accept="image/*" multiple onChange={handleMaterialUpload} className="hidden" />
                  </label>
                  {workflow.materials.length > 0 && (
                    <div className="grid grid-cols-4 gap-2">
                      {workflow.materials.map(material => (
                        <div key={material.id} className="relative group">
                          <img src={material.preview} alt="Material" className="aspect-video object-cover rounded-lg" />
                          <button
                            onClick={() => removeMaterial(material.id)}
                            className="absolute top-1 right-1 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-xs"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <Button 
                  onClick={generateThumbnail} 
                  disabled={isGenerating} 
                  className="w-full gradient-primary glow-sm h-12 text-lg"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin mr-2" />
                      生成中...
                    </>
                  ) : (
                    <>
                      <Wand2 className="w-5 h-5 mr-2" />
                      サムネイルを生成
                    </>
                  )}
                </Button>

                {workflow.generatedImages.length > 0 && (
                  <div className="space-y-4">
                    <h4 className="font-semibold">生成されたサムネイル</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {workflow.generatedImages.map((img, idx) => (
                        <div key={idx} className="relative group">
                          <img src={img} alt={`Generated ${idx + 1}`} className="aspect-video object-cover rounded-lg" />
                          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center gap-2">
                            <Button size="sm" variant="secondary" onClick={() => downloadImage(img)}>
                              <Download className="w-4 h-4 mr-1" />
                              ダウンロード
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={generateThumbnail} disabled={isGenerating} variant="outline">
                        <RefreshCw className="w-4 h-4 mr-2" />
                        別パターンを生成
                      </Button>
                      <Button onClick={resetWorkflow} variant="outline">
                        新規作成
                      </Button>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between pt-4">
                  <Button variant="outline" onClick={() => setWorkflow(prev => ({ ...prev, step: 5 }))}>
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    戻る
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Current Settings Summary */}
          {workflow.step >= 4 && (workflow.videoTitle || workflow.text) && (
            <Card className="glass">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">現在の設定</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                {workflow.videoTitle && <p className="text-sm"><span className="text-muted-foreground">タイトル:</span> {workflow.videoTitle}</p>}
                {workflow.text && <p className="text-lg font-bold">{workflow.text}</p>}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
