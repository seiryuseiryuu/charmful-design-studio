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
  Pencil,
  Youtube,
  Search,
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

interface ChannelInput {
  id: string;
  url: string;
  name: string;
  type: 'own' | 'competitor';
  icon?: string;
  thumbnails: ChannelThumbnail[];
  isLoading: boolean;
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

interface ModelImageInfo {
  imageUrl: string;
  description: string;
  requiredMaterials: string[];
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
  modelImages: ModelImageInfo[];
  selectedModelIndex: number | null;
}

interface TextSuggestion {
  text: string;
  reason: string;
}

export default function ThumbnailWorkflow() {
  const { user } = useAuth();
  const { toast } = useToast();
  
  // チャンネル入力（毎回入力）
  const [ownChannel, setOwnChannel] = useState<ChannelInput>({
    id: 'own',
    url: '',
    name: '',
    type: 'own',
    thumbnails: [],
    isLoading: false,
  });
  const [competitorChannel, setCompetitorChannel] = useState<ChannelInput>({
    id: 'competitor',
    url: '',
    name: '',
    type: 'competitor',
    thumbnails: [],
    isLoading: false,
  });
  
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingModels, setIsGeneratingModels] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [refinementInstruction, setRefinementInstruction] = useState('');
  
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
    selectedModelIndex: null,
  });

  const [textSuggestions, setTextSuggestions] = useState<TextSuggestion[]>([]);
  const [isGeneratingSuggestions, setIsGeneratingSuggestions] = useState(false);

  const fetchChannelThumbnails = async (channel: ChannelInput, setChannel: React.Dispatch<React.SetStateAction<ChannelInput>>) => {
    if (!channel.url.trim()) {
      toast({ title: 'エラー', description: 'チャンネルURLを入力してください', variant: 'destructive' });
      return;
    }

    setChannel(prev => ({ ...prev, isLoading: true }));
    
    try {
      // チャンネル情報を取得
      const infoResponse = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fetch-channel-info`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channelUrl: channel.url }),
        }
      );
      const infoData = await infoResponse.json();
      
      if (infoData.success) {
        setChannel(prev => ({
          ...prev,
          name: infoData.channelName || prev.name,
          icon: infoData.channelIcon,
        }));
      }

      // サムネイルを取得
      const { data, error } = await supabase.functions.invoke('fetch-youtube-thumbnails', {
        body: { 
          channelUrl: channel.url, 
          channelId: channel.id,
          saveToDb: false, // DBに保存しない
        },
      });

      if (error) throw error;

      const thumbnails: ChannelThumbnail[] = (data.thumbnails || []).slice(0, 20).map((t: any, idx: number) => ({
        id: `${channel.id}-${idx}`,
        video_id: t.videoId || `video-${idx}`,
        video_title: t.title || '',
        thumbnail_url: t.thumbnailUrl || t.thumbnail_url,
        channel_name: infoData.channelName || channel.name,
        channel_type: channel.type,
      }));

      setChannel(prev => ({ ...prev, thumbnails, isLoading: false }));
      toast({ title: '取得完了', description: `${thumbnails.length}件のサムネイルを取得しました` });
    } catch (error) {
      console.error('Fetch error:', error);
      toast({ title: 'エラー', description: 'サムネイルの取得に失敗しました', variant: 'destructive' });
      setChannel(prev => ({ ...prev, isLoading: false }));
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
    setWorkflow(prev => ({ ...prev, modelImages: [], selectedModelIndex: null }));
    
    try {
      const pattern = workflow.patternAnalysis;
      const referenceImages = workflow.selectedReferences.map(t => t.thumbnail_url);
      
      const modelVariations = [
        { name: 'スタンダード', emphasis: '基本パターンに忠実' },
        { name: 'インパクト重視', emphasis: '視覚的インパクトを強調' },
        { name: 'シンプル', emphasis: 'すっきりとした構成' },
      ];

      const modelPromises = modelVariations.map(async (variation, idx) => {
        const prompt = `YouTubeサムネイルのモデル画像を生成してください。

【パターン分析結果を厳密に適用】
- テロップ配置: ${pattern.textPosition}
- 配色: ${pattern.colorScheme}
- 人物配置: ${pattern.personPosition}
- レイアウト: ${pattern.layout}
- 視覚効果: ${pattern.effects}

【バリエーション: ${variation.name}】
${variation.emphasis}を意識した構成にしてください。

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

        const descriptionPrompt = `このサムネイルモデル画像について、以下を分析してJSON形式で回答してください:
{
  "description": "構造の説明（テロップの位置、人物配置、背景、色使いなど50文字以内）",
  "requiredMaterials": ["必要な実写素材1", "必要な実写素材2"]
}

【${variation.name}】のパターンです。
- テロップ配置: ${pattern.textPosition}
- 人物配置: ${pattern.personPosition}
- 配色: ${pattern.colorScheme}`;

        const { data: descData } = await supabase.functions.invoke('chat', {
          body: {
            messages: [{ role: 'user', content: descriptionPrompt }],
          },
        });

        let description = `${variation.name}: ${variation.emphasis}`;
        let requiredMaterials: string[] = [];

        if (descData?.content) {
          try {
            const jsonMatch = descData.content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]);
              description = parsed.description || description;
              requiredMaterials = parsed.requiredMaterials || [];
            }
          } catch (e) {
            console.error('Description parse error:', e);
          }
        }

        return {
          imageUrl: data.imageUrl,
          description,
          requiredMaterials,
        };
      });

      const results = await Promise.all(modelPromises);
      setWorkflow(prev => ({ ...prev, modelImages: results.filter(r => r.imageUrl) }));
      toast({ title: '生成完了', description: 'モデル画像を3枚生成しました' });
    } catch (error) {
      console.error('Model generation error:', error);
      toast({ title: 'エラー', description: 'モデル画像の生成に失敗しました', variant: 'destructive' });
    } finally {
      setIsGeneratingModels(false);
    }
  };

  const selectModel = (index: number) => {
    setWorkflow(prev => ({ ...prev, selectedModelIndex: index }));
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
  ]
}

【重要ルール】
1. 文言は2〜6文字の超短いパワーワード（例: 「衝撃」「神回」「ヤバすぎ」「最強」「禁断」「激変」「限界突破」）
2. 感情を刺激する言葉を使う（驚き、好奇心、緊急性、独占感）
3. 数字があれば活用（「100万」「1位」「99%」など）
4. 疑問形や煽り表現も効果的（「なぜ？」「マジか」「嘘だろ」）`
          }],
        },
      });

      if (error) throw error;
      
      try {
        const jsonMatch = data.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          setTextSuggestions(parsed.textSuggestions || []);
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
    if (workflow.selectedModelIndex === null) {
      toast({ title: 'モデルを選択', description: 'モデル画像を1つ選択してください', variant: 'destructive' });
      return;
    }
    setWorkflow(prev => ({ ...prev, step: 4 }));
  };

  const proceedToStep5 = () => {
    if (!workflow.videoTitle.trim()) {
      toast({ title: 'タイトルを入力', description: '動画タイトルを入力してください', variant: 'destructive' });
      return;
    }
    setWorkflow(prev => ({ ...prev, step: 5 }));
  };

  const proceedToStep6 = () => {
    if (!workflow.text.trim()) {
      toast({ title: '文言を入力', description: 'サムネイルの文言を入力してください', variant: 'destructive' });
      return;
    }
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

      const selectedModel = workflow.selectedModelIndex !== null ? workflow.modelImages[workflow.selectedModelIndex] : null;
      const modelInfo = selectedModel
        ? `\n\n【選択されたモデルパターン】\n${selectedModel.description}`
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
      
      const personInfo = ownChannelRefs.length > 0
        ? `\n登場人物: 参考サムネイル（自チャンネル${ownChannelRefs.length}枚）に登場する人物と同じ人物を使用してください。`
        : '';
      
      const competitorInfo = competitorRefs.length > 0
        ? `\n\n【競合チャンネルの参考サムネイル（${competitorRefs.length}枚）】\nスタイル、構図、色使いなど視覚的な要素のみを参考にしてください。`
        : '';
      
      const prompt = `動画タイトル「${workflow.videoTitle}」のYouTubeサムネイル。
文言: ${workflow.text}${workflow.videoDescription ? `\n動画内容: ${workflow.videoDescription}` : ''}${personInfo}${modelInfo}${patternInfo}${competitorInfo}${materialDescText}`;

      const ownChannelImages = ownChannelRefs.map(t => t.thumbnail_url);
      const competitorImages = competitorRefs.map(t => t.thumbnail_url);
      const allReferenceImages = [...ownChannelImages, ...competitorImages];

      const { data, error } = await supabase.functions.invoke('generate-image', {
        body: { 
          prompt,
          referenceImages: allReferenceImages,
          assetCount: 0,
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

  const refineImage = async (imageUrl: string) => {
    if (!refinementInstruction.trim()) {
      toast({ title: '修正指示を入力', description: '修正したい内容を入力してください', variant: 'destructive' });
      return;
    }

    setIsRefining(true);
    try {
      const prompt = `以下のYouTubeサムネイルを修正してください。

【修正指示】
${refinementInstruction}

元の設定:
- 動画タイトル: ${workflow.videoTitle}
- 文言: ${workflow.text}
${workflow.patternAnalysis ? `- レイアウト: ${workflow.patternAnalysis.layout}` : ''}

修正指示に従って画像を調整してください。アスペクト比16:9を維持してください。`;

      const { data, error } = await supabase.functions.invoke('generate-image', {
        body: { 
          prompt,
          referenceImages: [imageUrl],
          assetCount: 0,
          ownChannelCount: 0,
          competitorCount: 1,
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
          prompt: `修正: ${refinementInstruction}`,
          title: workflow.text.slice(0, 100),
        });

        setRefinementInstruction('');
        toast({ title: '修正完了', description: '修正版サムネイルが生成されました' });
      }
    } catch (error) {
      console.error('Refine error:', error);
      toast({ title: 'エラー', description: '画像修正に失敗しました', variant: 'destructive' });
    } finally {
      setIsRefining(false);
    }
  };

  const resetWorkflow = () => {
    setOwnChannel({
      id: 'own',
      url: '',
      name: '',
      type: 'own',
      thumbnails: [],
      isLoading: false,
    });
    setCompetitorChannel({
      id: 'competitor',
      url: '',
      name: '',
      type: 'competitor',
      thumbnails: [],
      isLoading: false,
    });
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
      selectedModelIndex: null,
    });
    setTextSuggestions([]);
    setRefinementInstruction('');
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

  const allThumbnails = [...ownChannel.thumbnails, ...competitorChannel.thumbnails];
  const selectedModel = workflow.selectedModelIndex !== null ? workflow.modelImages[workflow.selectedModelIndex] : null;

  const steps = [
    { num: 1, title: 'チャンネル入力', icon: Youtube },
    { num: 2, title: 'パターン分析', icon: Eye },
    { num: 3, title: 'モデル選択', icon: Sparkles },
    { num: 4, title: '素材準備', icon: Camera },
    { num: 5, title: 'タイトル・文言', icon: Type },
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
              チャンネルを入力してパターン分析からサムネイルを作成
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
          {/* Step 1: Channel Input & Reference Selection */}
          {workflow.step === 1 && (
            <Card className="glass">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Youtube className="w-5 h-5 text-primary" />
                  Step 1: チャンネルを入力して参考サムネイルを選択（最大10枚）
                </CardTitle>
                <CardDescription>
                  自分のチャンネルと競合チャンネルのURLを入力してサムネイルを取得
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Channel Input Section */}
                <div className="grid md:grid-cols-2 gap-4">
                  {/* Own Channel */}
                  <div className="p-4 border border-border rounded-lg space-y-3">
                    <div className="flex items-center gap-2">
                      <Badge className="bg-blue-500/80">自分のチャンネル</Badge>
                      {ownChannel.icon && (
                        <img src={ownChannel.icon} alt="" className="w-6 h-6 rounded-full" />
                      )}
                      {ownChannel.name && (
                        <span className="text-sm text-muted-foreground">{ownChannel.name}</span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Input
                        value={ownChannel.url}
                        onChange={(e) => setOwnChannel(prev => ({ ...prev, url: e.target.value }))}
                        placeholder="https://youtube.com/@..."
                        className="flex-1 bg-secondary/50"
                      />
                      <Button
                        onClick={() => fetchChannelThumbnails(ownChannel, setOwnChannel)}
                        disabled={ownChannel.isLoading || !ownChannel.url.trim()}
                        size="icon"
                        variant="outline"
                      >
                        {ownChannel.isLoading ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Search className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                    {ownChannel.thumbnails.length > 0 && (
                      <p className="text-xs text-muted-foreground">{ownChannel.thumbnails.length}件取得済み</p>
                    )}
                  </div>

                  {/* Competitor Channel */}
                  <div className="p-4 border border-border rounded-lg space-y-3">
                    <div className="flex items-center gap-2">
                      <Badge className="bg-orange-500/80">競合チャンネル</Badge>
                      {competitorChannel.icon && (
                        <img src={competitorChannel.icon} alt="" className="w-6 h-6 rounded-full" />
                      )}
                      {competitorChannel.name && (
                        <span className="text-sm text-muted-foreground">{competitorChannel.name}</span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Input
                        value={competitorChannel.url}
                        onChange={(e) => setCompetitorChannel(prev => ({ ...prev, url: e.target.value }))}
                        placeholder="https://youtube.com/@..."
                        className="flex-1 bg-secondary/50"
                      />
                      <Button
                        onClick={() => fetchChannelThumbnails(competitorChannel, setCompetitorChannel)}
                        disabled={competitorChannel.isLoading || !competitorChannel.url.trim()}
                        size="icon"
                        variant="outline"
                      >
                        {competitorChannel.isLoading ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Search className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                    {competitorChannel.thumbnails.length > 0 && (
                      <p className="text-xs text-muted-foreground">{competitorChannel.thumbnails.length}件取得済み</p>
                    )}
                  </div>
                </div>

                {/* Thumbnail Selection */}
                {allThumbnails.length > 0 && (
                  <Tabs defaultValue="own" className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="own">自分 ({ownChannel.thumbnails.length})</TabsTrigger>
                      <TabsTrigger value="competitor">競合 ({competitorChannel.thumbnails.length})</TabsTrigger>
                    </TabsList>
                    <TabsContent value="own" className="mt-4">
                      {ownChannel.thumbnails.length === 0 ? (
                        <p className="text-center text-muted-foreground py-8">
                          自分のチャンネルURLを入力してサムネイルを取得してください
                        </p>
                      ) : (
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                          {ownChannel.thumbnails.map(thumb => (
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
                      {competitorChannel.thumbnails.length === 0 ? (
                        <p className="text-center text-muted-foreground py-8">
                          競合チャンネルURLを入力してサムネイルを取得してください
                        </p>
                      ) : (
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                          {competitorChannel.thumbnails.map(thumb => (
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
                )}

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

          {/* Step 3: Model Selection */}
          {workflow.step === 3 && (
            <Card className="glass">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-primary" />
                  Step 3: モデル画像を選択
                </CardTitle>
                <CardDescription>
                  パターンに基づいて3つのモデルを生成します。1つを選んでください
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {workflow.modelImages.length === 0 ? (
                  <Button 
                    onClick={generateModelImages} 
                    disabled={isGeneratingModels}
                    className="w-full gradient-primary"
                  >
                    {isGeneratingModels ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        モデル生成中...（約30秒）
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 mr-2" />
                        モデル画像を生成
                      </>
                    )}
                  </Button>
                ) : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {workflow.modelImages.map((model, idx) => (
                        <div
                          key={idx}
                          onClick={() => selectModel(idx)}
                          className={`cursor-pointer rounded-lg overflow-hidden border-2 transition-all ${
                            workflow.selectedModelIndex === idx
                              ? 'border-primary ring-2 ring-primary/20'
                              : 'border-transparent hover:border-primary/50'
                          }`}
                        >
                          <img src={model.imageUrl} alt={`Model ${idx + 1}`} className="aspect-video object-cover" />
                          <div className="p-3 bg-secondary/30">
                            <div className="flex items-center justify-between mb-1">
                              <Badge variant="outline">パターン {idx + 1}</Badge>
                              {workflow.selectedModelIndex === idx && (
                                <Check className="w-4 h-4 text-primary" />
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground">{model.description}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                    <Button
                      onClick={generateModelImages}
                      disabled={isGeneratingModels}
                      variant="outline"
                      className="w-full"
                    >
                      {isGeneratingModels ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      ) : (
                        <RefreshCw className="w-4 h-4 mr-2" />
                      )}
                      別のモデルを生成
                    </Button>
                  </div>
                )}

                <div className="flex items-center justify-between pt-4">
                  <Button variant="outline" onClick={() => setWorkflow(prev => ({ ...prev, step: 2 }))}>
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    戻る
                  </Button>
                  <Button onClick={proceedToStep4} disabled={workflow.selectedModelIndex === null} className="gradient-primary">
                    次へ
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 4: Material Preparation */}
          {workflow.step === 4 && (
            <Card className="glass">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Camera className="w-5 h-5 text-primary" />
                  Step 4: 必要素材を準備
                </CardTitle>
                <CardDescription>
                  選択したモデルに必要な素材を用意してください
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {selectedModel && (
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <img src={selectedModel.imageUrl} alt="Selected model" className="aspect-video object-cover rounded-lg" />
                    </div>
                    <div className="space-y-3">
                      <div className="p-3 bg-secondary/30 rounded-lg">
                        <h5 className="font-medium text-sm mb-1">構造説明</h5>
                        <p className="text-sm text-muted-foreground">{selectedModel.description}</p>
                      </div>
                      {selectedModel.requiredMaterials.length > 0 && (
                        <div className="p-3 bg-primary/5 rounded-lg border border-primary/20">
                          <h5 className="font-medium text-sm mb-2 flex items-center gap-2">
                            <Lightbulb className="w-4 h-4 text-yellow-500" />
                            必要な素材
                          </h5>
                          <ul className="space-y-1">
                            {selectedModel.requiredMaterials.map((material, idx) => (
                              <li key={idx} className="text-sm flex items-start gap-2">
                                <span className="text-primary">•</span>
                                <span>{material}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="space-y-3">
                  <label className="text-sm font-medium">素材をアップロード（任意）</label>
                  <label className="block">
                    <div className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors">
                      <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                      <p className="text-sm text-muted-foreground">クリックして素材をアップロード</p>
                      <p className="text-xs text-muted-foreground mt-1">実写写真、商品画像など</p>
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

                <div className="flex items-center justify-between pt-4">
                  <Button variant="outline" onClick={() => setWorkflow(prev => ({ ...prev, step: 3 }))}>
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    戻る
                  </Button>
                  <Button onClick={proceedToStep5} className="gradient-primary">
                    次へ
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 5: Title & Text */}
          {workflow.step === 5 && (
            <Card className="glass">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Type className="w-5 h-5 text-primary" />
                  Step 5: タイトルと文言を入力
                </CardTitle>
                <CardDescription>
                  動画タイトルとサムネイルに表示する文言を決めましょう
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
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
                    className="bg-secondary/50 min-h-[60px]"
                  />
                </div>

                <div className="border-t pt-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium flex items-center gap-2">
                      サムネイル文言 *
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
                    <div className="space-y-3 p-4 bg-primary/5 rounded-lg border border-primary/20 mt-4">
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
                </div>

                <div className="flex items-center justify-between pt-4">
                  <Button variant="outline" onClick={() => setWorkflow(prev => ({ ...prev, step: 4 }))}>
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    戻る
                  </Button>
                  <Button onClick={proceedToStep6} disabled={!workflow.videoTitle.trim() || !workflow.text.trim()} className="gradient-primary">
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
                  設定に基づいてサムネイルを生成します
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
                  {selectedModel && (
                    <p className="text-sm"><span className="font-medium">選択モデル:</span> {selectedModel.description.slice(0, 30)}...</p>
                  )}
                  <p className="text-sm"><span className="font-medium">アップロード素材:</span> {workflow.materials.length}枚</p>
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
                        <div key={idx} className="space-y-2">
                          <div className="relative group">
                            <img src={img} alt={`Generated ${idx + 1}`} className="aspect-video object-cover rounded-lg" />
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center gap-2">
                              <Button size="sm" variant="secondary" onClick={() => downloadImage(img)}>
                                <Download className="w-4 h-4 mr-1" />
                                ダウンロード
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Refinement Section */}
                    <div className="p-4 bg-secondary/30 rounded-lg space-y-3">
                      <h5 className="font-medium flex items-center gap-2">
                        <Pencil className="w-4 h-4 text-primary" />
                        画像を修正する
                      </h5>
                      <Textarea
                        value={refinementInstruction}
                        onChange={(e) => setRefinementInstruction(e.target.value)}
                        placeholder="例：文字をもっと大きく、背景を暗く、人物を右に寄せて..."
                        className="bg-background/50 min-h-[60px]"
                      />
                      <Button
                        onClick={() => refineImage(workflow.generatedImages[workflow.generatedImages.length - 1])}
                        disabled={isRefining || !refinementInstruction.trim()}
                        variant="outline"
                        className="w-full"
                      >
                        {isRefining ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin mr-2" />
                            修正中...
                          </>
                        ) : (
                          <>
                            <Pencil className="w-4 h-4 mr-2" />
                            修正指示で再生成
                          </>
                        )}
                      </Button>
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
          {workflow.step >= 5 && (workflow.videoTitle || workflow.text) && (
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
