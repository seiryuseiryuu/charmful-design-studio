import { useState } from 'react';
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
  Upload,
  Lightbulb,
  Eye,
  Pencil,
  Youtube,
  Search,
  Plus,
  X,
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

interface MaterialSuggestion {
  name: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
}

interface TextSuggestionItem {
  text: string;
  reason: string;
}

interface ModelImageInfo {
  imageUrl: string;
  description: string;
  requiredMaterials: MaterialSuggestion[];
  suggestedTexts: TextSuggestionItem[];
}

interface WorkflowState {
  step: number;
  selectedReferences: ChannelThumbnail[];
  videoTitle: string;
  videoDescription: string;
  text: string;
  materials: MaterialItem[];
  generatedImages: string[];
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
  
  // チャンネル入力
  const [ownChannel, setOwnChannel] = useState<ChannelInput>({
    id: 'own',
    url: '',
    name: '',
    type: 'own',
    thumbnails: [],
    isLoading: false,
  });
  
  // 複数の競合チャンネル
  const [competitorChannels, setCompetitorChannels] = useState<ChannelInput[]>([
    {
      id: 'competitor-0',
      url: '',
      name: '',
      type: 'competitor',
      thumbnails: [],
      isLoading: false,
    },
  ]);

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingModels, setIsGeneratingModels] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [refinementInstruction, setRefinementInstruction] = useState('');
  const [textSuggestions, setTextSuggestions] = useState<TextSuggestion[]>([]);
  const [isGeneratingSuggestions, setIsGeneratingSuggestions] = useState(false);
  const [modelFeedback, setModelFeedback] = useState('');
  const [isRegeneratingModel, setIsRegeneratingModel] = useState(false);
  
  const [workflow, setWorkflow] = useState<WorkflowState>({
    step: 1,
    selectedReferences: [],
    videoTitle: '',
    videoDescription: '',
    text: '',
    materials: [],
    generatedImages: [],
    patternAnalysis: null,
    modelImages: [],
    selectedModelIndex: null,
  });

  const addCompetitorChannel = () => {
    const newId = `competitor-${competitorChannels.length}`;
    setCompetitorChannels(prev => [
      ...prev,
      {
        id: newId,
        url: '',
        name: '',
        type: 'competitor',
        thumbnails: [],
        isLoading: false,
      },
    ]);
  };

  const removeCompetitorChannel = (id: string) => {
    if (competitorChannels.length > 1) {
      setCompetitorChannels(prev => prev.filter(c => c.id !== id));
      setWorkflow(prev => ({
        ...prev,
        selectedReferences: prev.selectedReferences.filter(t => !t.id.startsWith(id)),
      }));
    }
  };

  const updateCompetitorChannel = (id: string, updates: Partial<ChannelInput>) => {
    setCompetitorChannels(prev =>
      prev.map(c => (c.id === id ? { ...c, ...updates } : c))
    );
  };

  // サムネイル取得＆自動選択（直近10個）
  const fetchChannelThumbnails = async (
    channel: ChannelInput, 
    setChannel: React.Dispatch<React.SetStateAction<ChannelInput>>,
    autoSelect: boolean = true
  ) => {
    if (!channel.url.trim()) {
      toast({ title: 'エラー', description: 'チャンネルURLを入力してください', variant: 'destructive' });
      return;
    }

    setChannel(prev => ({ ...prev, isLoading: true }));
    
    try {
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

      const { data, error } = await supabase.functions.invoke('fetch-youtube-thumbnails', {
        body: { 
          channelUrl: channel.url, 
          channelId: channel.id,
          saveToDb: false,
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
      
      // 自動選択: 直近10個を選択
      if (autoSelect && thumbnails.length > 0) {
        const toSelect = thumbnails.slice(0, 10);
        setWorkflow(prev => {
          // 既存の選択から同じチャンネルのものを除去して新しいものを追加
          const otherSelections = prev.selectedReferences.filter(t => !t.id.startsWith(channel.id));
          const combined = [...otherSelections, ...toSelect];
          // 合計10個まで
          return { ...prev, selectedReferences: combined.slice(0, 10) };
        });
      }
      
      toast({ title: '取得完了', description: `${thumbnails.length}件のサムネイルを取得${autoSelect ? '（直近10個を自動選択）' : ''}` });
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
  "textPosition": "テロップ・文字の配置パターン",
  "colorScheme": "使われている配色パターン",
  "personPosition": "人物の配置パターン",
  "layout": "全体的なレイアウトパターン",
  "effects": "使われている視覚効果"
}`
          }],
        },
      });

      if (error) throw error;

      const jsonMatch = data.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        setWorkflow(prev => ({ ...prev, patternAnalysis: parsed }));
      }
    } catch (error) {
      console.error('Analysis error:', error);
      toast({ title: 'エラー', description: 'パターン分析に失敗しました', variant: 'destructive' });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const generateModelImages = async () => {
    if (!workflow.patternAnalysis) return;

    setIsGeneratingModels(true);
    setWorkflow(prev => ({ ...prev, modelImages: [], selectedModelIndex: null }));
    
    try {
      const pattern = workflow.patternAnalysis;
      const ownChannelRefs = workflow.selectedReferences.filter(t => t.channel_type === 'own');
      const competitorRefs = workflow.selectedReferences.filter(t => t.channel_type !== 'own');
      const referenceImages = [...ownChannelRefs, ...competitorRefs].map(t => t.thumbnail_url);
      const referenceTitles = workflow.selectedReferences.map(t => t.video_title).filter(Boolean).slice(0, 5);
      
      const modelVariations = [
        { name: 'スタンダード', emphasis: '基本パターンに忠実' },
        { name: 'インパクト重視', emphasis: '視覚的インパクトを強調' },
        { name: 'シンプル', emphasis: 'すっきりとした構成' },
      ];

      const modelPromises = modelVariations.map(async (variation) => {
        // 動画タイトル・内容・参考動画をプロンプトに組み込む
        const prompt = `YouTubeサムネイルのモデル画像を生成。

【動画情報】
タイトル: ${workflow.videoTitle}
${workflow.videoDescription ? `内容: ${workflow.videoDescription}` : ''}

【参考動画タイトル】
${referenceTitles.map((t, i) => `${i + 1}. ${t}`).join('\n')}

【パターン分析結果】
- テロップ配置: ${pattern.textPosition}
- 配色: ${pattern.colorScheme}
- 人物配置: ${pattern.personPosition}
- レイアウト: ${pattern.layout}
- 効果: ${pattern.effects}

【バリエーション】${variation.name} - ${variation.emphasis}

【生成ルール】
- アスペクト比: 16:9（1280x720）
- テロップはタイトル・内容から最もインパクトのある2〜6文字を使用
- 人物配置は分析結果に従う
- ダミーではなく、実際の動画内容を反映させる`;

        const { data, error } = await supabase.functions.invoke('generate-image', {
          body: { 
            prompt,
            referenceImages: referenceImages.slice(0, 5),
            assetCount: 0,
            ownChannelCount: ownChannelRefs.length,
            competitorCount: competitorRefs.length,
          },
        });

        if (error) throw error;

        // 生成されたモデル画像から必要素材・文言を複数提案
        const { data: descData } = await supabase.functions.invoke('chat', {
          body: {
            messages: [{ 
              role: 'user', 
              content: `動画タイトル「${workflow.videoTitle}」${workflow.videoDescription ? `（内容: ${workflow.videoDescription}）` : ''}のサムネイルモデルを分析してください。

以下のJSON形式で回答:
{
  "description": "このモデルの構造説明（50文字以内）",
  "requiredMaterials": [
    {"name": "素材名", "description": "具体的な説明", "priority": "high"},
    {"name": "素材名2", "description": "具体的な説明", "priority": "medium"}
  ],
  "suggestedTexts": [
    {"text": "文言1（2〜6文字）", "reason": "選んだ理由"},
    {"text": "文言2（2〜6文字）", "reason": "選んだ理由"},
    {"text": "文言3（2〜6文字）", "reason": "選んだ理由"}
  ]
}

※必要素材は本当に必要なもののみ（優先度: high/medium/low）
※文言は3つ以上提案` 
            }],
          },
        });

        let description = `${variation.name}: ${variation.emphasis}`;
        let requiredMaterials: MaterialSuggestion[] = [];
        let suggestedTexts: TextSuggestionItem[] = [];

        if (descData?.content) {
          try {
            const match = descData.content.match(/\{[\s\S]*\}/);
            if (match) {
              const parsed = JSON.parse(match[0]);
              description = parsed.description || description;
              requiredMaterials = parsed.requiredMaterials || [];
              suggestedTexts = parsed.suggestedTexts || [];
            }
          } catch {}
        }

        return { imageUrl: data.imageUrl, description, requiredMaterials, suggestedTexts };
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

  // モデル修正フィードバックで再生成
  const regenerateModelWithFeedback = async () => {
    if (!modelFeedback.trim() || workflow.selectedModelIndex === null) return;
    
    setIsRegeneratingModel(true);
    try {
      const pattern = workflow.patternAnalysis;
      const ownChannelRefs = workflow.selectedReferences.filter(t => t.channel_type === 'own');
      const competitorRefs = workflow.selectedReferences.filter(t => t.channel_type !== 'own');
      const referenceImages = [...ownChannelRefs, ...competitorRefs].map(t => t.thumbnail_url);
      const referenceTitles = workflow.selectedReferences.map(t => t.video_title).filter(Boolean).slice(0, 5);
      
      const prompt = `YouTubeサムネイルのモデル画像を修正生成。

【修正指示】
${modelFeedback}

【動画情報】
タイトル: ${workflow.videoTitle}
${workflow.videoDescription ? `内容: ${workflow.videoDescription}` : ''}

【参考動画タイトル】
${referenceTitles.map((t, i) => `${i + 1}. ${t}`).join('\n')}

【パターン分析結果（必ず踏襲）】
- テロップ配置: ${pattern?.textPosition || ''}
- 配色: ${pattern?.colorScheme || ''}
- 人物配置: ${pattern?.personPosition || ''}
- レイアウト: ${pattern?.layout || ''}
- 効果: ${pattern?.effects || ''}

【生成ルール】
- 修正指示を反映しつつ、パターン分析の構図を踏襲
- アスペクト比: 16:9（1280x720）`;

      const { data, error } = await supabase.functions.invoke('generate-image', {
        body: { 
          prompt,
          referenceImages: referenceImages.slice(0, 5),
          assetCount: 0,
          ownChannelCount: ownChannelRefs.length,
          competitorCount: competitorRefs.length,
        },
      });

      if (error) throw error;

      // 分析
      const { data: descData } = await supabase.functions.invoke('chat', {
        body: {
          messages: [{ 
            role: 'user', 
            content: `動画タイトル「${workflow.videoTitle}」のサムネイルモデルを分析。
JSON形式で回答:
{
  "description": "構造説明（50文字以内）",
  "requiredMaterials": [{"name": "素材名", "description": "説明", "priority": "high"}],
  "suggestedTexts": [{"text": "文言（2〜6文字）", "reason": "理由"}]
}` 
          }],
        },
      });

      let description = '修正版モデル';
      let requiredMaterials: MaterialSuggestion[] = [];
      let suggestedTexts: TextSuggestionItem[] = [];

      if (descData?.content) {
        try {
          const match = descData.content.match(/\{[\s\S]*\}/);
          if (match) {
            const parsed = JSON.parse(match[0]);
            description = parsed.description || description;
            requiredMaterials = parsed.requiredMaterials || [];
            suggestedTexts = parsed.suggestedTexts || [];
          }
        } catch {}
      }

      const newModel: ModelImageInfo = { imageUrl: data.imageUrl, description, requiredMaterials, suggestedTexts };
      
      setWorkflow(prev => {
        const newImages = [...prev.modelImages];
        newImages[prev.selectedModelIndex!] = newModel;
        return { ...prev, modelImages: newImages };
      });
      
      setModelFeedback('');
      toast({ title: '修正完了', description: 'モデル画像を修正しました' });
    } catch (error) {
      console.error('Regenerate error:', error);
      toast({ title: 'エラー', description: 'モデル修正に失敗しました', variant: 'destructive' });
    } finally {
      setIsRegeneratingModel(false);
    }
  };

  const generateSuggestionsFromTitle = async () => {
    if (!workflow.videoTitle.trim()) return;

    setIsGeneratingSuggestions(true);
    try {
      const { data, error } = await supabase.functions.invoke('chat', {
        body: {
          messages: [{
            role: 'user',
            content: `動画タイトル「${workflow.videoTitle}」${workflow.videoDescription ? `\n内容: ${workflow.videoDescription}` : ''}

クリックしたくなる2〜6文字のパワーワードを3つ提案。JSON形式:
{"textSuggestions": [{"text": "...", "reason": "..."}]}`
          }],
        },
      });

      if (error) throw error;
      
      const jsonMatch = data.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        setTextSuggestions(parsed.textSuggestions || []);
      }
    } catch (error) {
      console.error('Suggestion error:', error);
      toast({ title: 'エラー', description: '提案の生成に失敗しました', variant: 'destructive' });
    } finally {
      setIsGeneratingSuggestions(false);
    }
  };

  const handleMaterialUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const newMaterials: MaterialItem[] = Array.from(files).map(file => ({
      id: crypto.randomUUID(),
      file,
      preview: URL.createObjectURL(file),
      description: '',
    }));
    setWorkflow(prev => ({ ...prev, materials: [...prev.materials, ...newMaterials] }));
  };

  const removeMaterial = (id: string) => {
    setWorkflow(prev => ({ ...prev, materials: prev.materials.filter(m => m.id !== id) }));
  };

  const generateThumbnail = async () => {
    setIsGenerating(true);
    try {
      const ownChannelRefs = workflow.selectedReferences.filter(t => t.channel_type === 'own');
      const competitorRefs = workflow.selectedReferences.filter(t => t.channel_type !== 'own');
      const selectedModel = workflow.selectedModelIndex !== null ? workflow.modelImages[workflow.selectedModelIndex] : null;
      const referenceTitles = workflow.selectedReferences.map(t => t.video_title).filter(Boolean).slice(0, 5);
      const pattern = workflow.patternAnalysis;

      const prompt = `YouTubeサムネイルを生成。

【動画情報】
タイトル: ${workflow.videoTitle}
${workflow.videoDescription ? `内容: ${workflow.videoDescription}` : ''}

【サムネイル文言】${workflow.text}

【参考動画タイトル】
${referenceTitles.map((t, i) => `${i + 1}. ${t}`).join('\n')}

${pattern ? `【パターン分析（これに従って生成）】
- テロップ配置: ${pattern.textPosition}
- 配色: ${pattern.colorScheme}
- 人物配置: ${pattern.personPosition}
- レイアウト: ${pattern.layout}
- 効果: ${pattern.effects}` : ''}

${selectedModel ? `【選択モデル】${selectedModel.description}` : ''}

【生成ルール】
- アスペクト比: 16:9（1280x720）
- 文言「${workflow.text}」をテロップ配置パターンに従って配置
- 人物配置パターンに従って人物を配置
- 効果・配色パターンを適用`;

      const { data, error } = await supabase.functions.invoke('generate-image', {
        body: { 
          prompt,
          referenceImages: [...ownChannelRefs, ...competitorRefs].map(t => t.thumbnail_url),
          assetCount: 0,
          ownChannelCount: ownChannelRefs.length,
          competitorCount: competitorRefs.length,
        },
      });

      if (error) throw error;
      
      if (data.imageUrl) {
        setWorkflow(prev => ({ ...prev, generatedImages: [...prev.generatedImages, data.imageUrl] }));
        await supabase.from('thumbnails').insert({
          user_id: user!.id,
          image_url: data.imageUrl,
          prompt,
          title: workflow.text.slice(0, 100),
        });
        toast({ title: '生成完了' });
      }
    } catch (error) {
      console.error('Generate error:', error);
      toast({ title: 'エラー', description: '画像生成に失敗しました', variant: 'destructive' });
    } finally {
      setIsGenerating(false);
    }
  };

  const refineImage = async (imageUrl: string) => {
    if (!refinementInstruction.trim()) return;

    setIsRefining(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-image', {
        body: { 
          prompt: `修正指示: ${refinementInstruction}\n元タイトル: ${workflow.videoTitle}\n文言: ${workflow.text}`,
          referenceImages: [imageUrl],
          assetCount: 0,
          ownChannelCount: 0,
          competitorCount: 1,
        },
      });

      if (error) throw error;
      
      if (data.imageUrl) {
        setWorkflow(prev => ({ ...prev, generatedImages: [...prev.generatedImages, data.imageUrl] }));
        await supabase.from('thumbnails').insert({
          user_id: user!.id,
          image_url: data.imageUrl,
          prompt: `修正: ${refinementInstruction}`,
          title: workflow.text.slice(0, 100),
        });
        setRefinementInstruction('');
        toast({ title: '修正完了' });
      }
    } catch (error) {
      console.error('Refine error:', error);
      toast({ title: 'エラー', variant: 'destructive' });
    } finally {
      setIsRefining(false);
    }
  };

  const resetWorkflow = () => {
    setOwnChannel({ id: 'own', url: '', name: '', type: 'own', thumbnails: [], isLoading: false });
    setCompetitorChannels([{ id: 'competitor-0', url: '', name: '', type: 'competitor', thumbnails: [], isLoading: false }]);
    setWorkflow({
      step: 1,
      selectedReferences: [],
      videoTitle: '',
      videoDescription: '',
      text: '',
      materials: [],
      generatedImages: [],
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

  const competitorThumbnails = competitorChannels.flatMap(c => c.thumbnails);
  const allThumbnails = [...ownChannel.thumbnails, ...competitorThumbnails];
  const selectedModel = workflow.selectedModelIndex !== null ? workflow.modelImages[workflow.selectedModelIndex] : null;

  // 新しいステップ順序
  const steps = [
    { num: 1, title: 'タイトル入力', icon: Type },
    { num: 2, title: 'チャンネル選択', icon: Youtube },
    { num: 3, title: 'パターン分析', icon: Eye },
    { num: 4, title: 'モデル選択', icon: Sparkles },
    { num: 5, title: '素材・文言', icon: Camera },
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
            <p className="text-muted-foreground mt-1">タイトルから始めてサムネイルを作成</p>
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
                  {workflow.step > step.num ? <Check className="w-4 h-4" /> : <step.icon className="w-4 h-4" />}
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
          {/* Step 1: Title Input */}
          {workflow.step === 1 && (
            <Card className="glass">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Type className="w-5 h-5 text-primary" />
                  Step 1: 動画タイトル・内容を入力
                </CardTitle>
                <CardDescription>まず動画のタイトルと内容を入力してください</CardDescription>
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
                    className="bg-secondary/50 min-h-[100px]"
                  />
                </div>
                <div className="flex justify-end pt-4">
                  <Button 
                    onClick={() => setWorkflow(prev => ({ ...prev, step: 2 }))} 
                    disabled={!workflow.videoTitle.trim()} 
                    className="gradient-primary"
                  >
                    次へ
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 2: Channel Input & Reference Selection */}
          {workflow.step === 2 && (
            <Card className="glass">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Youtube className="w-5 h-5 text-primary" />
                  Step 2: チャンネルを入力（自動で直近10個を選択）
                </CardTitle>
                <CardDescription>
                  チャンネルURLを入力すると直近10個のサムネイルが自動選択されます
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid md:grid-cols-2 gap-4">
                  {/* Own Channel */}
                  <div className="p-4 border border-border rounded-lg space-y-3">
                    <div className="flex items-center gap-2">
                      <Badge className="bg-blue-500/80">自分のチャンネル</Badge>
                      {ownChannel.icon && <img src={ownChannel.icon} alt="" className="w-6 h-6 rounded-full" />}
                      {ownChannel.name && <span className="text-sm text-muted-foreground">{ownChannel.name}</span>}
                    </div>
                    <div className="flex gap-2">
                      <Input
                        value={ownChannel.url}
                        onChange={(e) => setOwnChannel(prev => ({ ...prev, url: e.target.value }))}
                        placeholder="https://youtube.com/@..."
                        className="flex-1 bg-secondary/50"
                      />
                      <Button
                        onClick={() => fetchChannelThumbnails(ownChannel, setOwnChannel, true)}
                        disabled={ownChannel.isLoading || !ownChannel.url.trim()}
                        size="icon"
                        variant="outline"
                      >
                        {ownChannel.isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                      </Button>
                    </div>
                    {ownChannel.thumbnails.length > 0 && (
                      <p className="text-xs text-muted-foreground">{ownChannel.thumbnails.length}件取得済み</p>
                    )}
                  </div>

                  {/* Competitor Channels */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Badge className="bg-orange-500/80">競合チャンネル</Badge>
                      <Button variant="outline" size="sm" onClick={addCompetitorChannel}>
                        <Plus className="w-4 h-4 mr-1" />
                        追加
                      </Button>
                    </div>
                    {competitorChannels.map((channel, index) => (
                      <div key={channel.id} className="p-3 border border-border rounded-lg space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium">競合 {index + 1}</span>
                          {channel.icon && <img src={channel.icon} alt="" className="w-5 h-5 rounded-full" />}
                          {channel.name && <span className="text-xs text-muted-foreground">{channel.name}</span>}
                          {competitorChannels.length > 1 && (
                            <Button variant="ghost" size="icon" className="ml-auto h-5 w-5" onClick={() => removeCompetitorChannel(channel.id)}>
                              <X className="w-3 h-3" />
                            </Button>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <Input
                            value={channel.url}
                            onChange={(e) => updateCompetitorChannel(channel.id, { url: e.target.value })}
                            placeholder="https://youtube.com/@..."
                            className="flex-1 bg-secondary/50 h-8 text-sm"
                          />
                          <Button
                            onClick={() => {
                              const setChannel = (updater: (prev: ChannelInput) => ChannelInput) => {
                                setCompetitorChannels(prev => prev.map(c => (c.id === channel.id ? updater(c) : c)));
                              };
                              fetchChannelThumbnails(channel, setChannel, true);
                            }}
                            disabled={channel.isLoading || !channel.url.trim()}
                            size="icon"
                            variant="outline"
                            className="h-8 w-8"
                          >
                            {channel.isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Thumbnail Selection */}
                {allThumbnails.length > 0 && (
                  <Tabs defaultValue="own" className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="own">自分 ({ownChannel.thumbnails.length})</TabsTrigger>
                      <TabsTrigger value="competitor">競合 ({competitorThumbnails.length})</TabsTrigger>
                    </TabsList>
                    <TabsContent value="own" className="mt-4">
                      {ownChannel.thumbnails.length === 0 ? (
                        <p className="text-center text-muted-foreground py-8">URLを入力してサムネイルを取得</p>
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
                      {competitorThumbnails.length === 0 ? (
                        <p className="text-center text-muted-foreground py-8">競合URLを入力してサムネイルを取得</p>
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
                              <Badge className="absolute bottom-1 left-1 text-xs bg-orange-500/80">{thumb.channel_name?.slice(0, 6) || '競合'}</Badge>
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
                  <div className="flex items-center gap-4">
                    <Button variant="outline" onClick={() => setWorkflow(prev => ({ ...prev, step: 1 }))}>
                      <ArrowLeft className="w-4 h-4 mr-2" />
                      戻る
                    </Button>
                    <span className="text-sm text-muted-foreground">{workflow.selectedReferences.length}/10 選択中</span>
                  </div>
                  <Button 
                    onClick={() => setWorkflow(prev => ({ ...prev, step: 3 }))} 
                    disabled={workflow.selectedReferences.length === 0} 
                    className="gradient-primary"
                  >
                    次へ
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 3: Pattern Analysis */}
          {workflow.step === 3 && (
            <Card className="glass">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Eye className="w-5 h-5 text-primary" />
                  Step 3: パターン分析
                </CardTitle>
                <CardDescription>選択した{workflow.selectedReferences.length}枚からパターンを抽出</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-5 gap-2">
                  {workflow.selectedReferences.map(thumb => (
                    <img key={thumb.id} src={thumb.thumbnail_url} alt="" className="aspect-video object-cover rounded-lg" />
                  ))}
                </div>

                <Button onClick={analyzePatterns} disabled={isAnalyzing} className="w-full gradient-primary">
                  {isAnalyzing ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />分析中...</> : <><Eye className="w-4 h-4 mr-2" />パターンを分析</>}
                </Button>

                {workflow.patternAnalysis && (
                  <div className="p-4 bg-primary/5 rounded-lg border border-primary/20 space-y-2">
                    <h4 className="font-semibold flex items-center gap-2"><Sparkles className="w-4 h-4 text-primary" />分析結果</h4>
                    <div className="grid gap-2 text-sm">
                      <div className="flex gap-2"><Badge variant="secondary">テロップ</Badge><span>{workflow.patternAnalysis.textPosition}</span></div>
                      <div className="flex gap-2"><Badge variant="secondary">配色</Badge><span>{workflow.patternAnalysis.colorScheme}</span></div>
                      <div className="flex gap-2"><Badge variant="secondary">人物</Badge><span>{workflow.patternAnalysis.personPosition}</span></div>
                      <div className="flex gap-2"><Badge variant="secondary">レイアウト</Badge><span>{workflow.patternAnalysis.layout}</span></div>
                      <div className="flex gap-2"><Badge variant="secondary">効果</Badge><span>{workflow.patternAnalysis.effects}</span></div>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between pt-4">
                  <Button variant="outline" onClick={() => setWorkflow(prev => ({ ...prev, step: 2 }))}>
                    <ArrowLeft className="w-4 h-4 mr-2" />戻る
                  </Button>
                  <Button onClick={() => setWorkflow(prev => ({ ...prev, step: 4 }))} disabled={!workflow.patternAnalysis} className="gradient-primary">
                    次へ<ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 4: Model Selection */}
          {workflow.step === 4 && (
            <Card className="glass">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Sparkles className="w-5 h-5 text-primary" />Step 4: モデル画像を選択</CardTitle>
                <CardDescription>パターンに基づいて3つのモデルを生成</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {workflow.modelImages.length === 0 ? (
                  <Button onClick={generateModelImages} disabled={isGeneratingModels} className="w-full gradient-primary">
                    {isGeneratingModels ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />生成中...</> : <><Sparkles className="w-4 h-4 mr-2" />モデル画像を生成</>}
                  </Button>
                ) : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {workflow.modelImages.map((model, idx) => (
                        <div
                          key={idx}
                          onClick={() => setWorkflow(prev => ({ ...prev, selectedModelIndex: idx }))}
                          className={`cursor-pointer rounded-lg overflow-hidden border-2 transition-all ${
                            workflow.selectedModelIndex === idx ? 'border-primary ring-2 ring-primary/20' : 'border-transparent hover:border-primary/50'
                          }`}
                        >
                          <img src={model.imageUrl} alt="" className="aspect-video object-cover" />
                          <div className="p-3 bg-secondary/30">
                            <div className="flex items-center justify-between mb-1">
                              <Badge variant="outline">パターン {idx + 1}</Badge>
                              {workflow.selectedModelIndex === idx && <Check className="w-4 h-4 text-primary" />}
                            </div>
                            <p className="text-sm text-muted-foreground">{model.description}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                    
                    {/* モデル修正フィードバック */}
                    <div className="p-4 bg-secondary/30 rounded-lg space-y-3">
                      <h5 className="font-medium flex items-center gap-2">
                        <Pencil className="w-4 h-4 text-primary" />
                        モデルを修正
                      </h5>
                      <Textarea
                        value={modelFeedback}
                        onChange={(e) => setModelFeedback(e.target.value)}
                        placeholder="例：人物を左側に配置して、文字をもっと大きく..."
                        className="bg-background/50 min-h-[60px]"
                      />
                      <div className="flex gap-2">
                        <Button 
                          onClick={regenerateModelWithFeedback} 
                          disabled={isRegeneratingModel || !modelFeedback.trim()} 
                          variant="outline"
                          className="flex-1"
                        >
                          {isRegeneratingModel ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />修正中...</> : <><Pencil className="w-4 h-4 mr-2" />修正して再生成</>}
                        </Button>
                        <Button onClick={generateModelImages} disabled={isGeneratingModels} variant="outline">
                          <RefreshCw className="w-4 h-4 mr-2" />全て再生成
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between pt-4">
                  <Button variant="outline" onClick={() => setWorkflow(prev => ({ ...prev, step: 3 }))}><ArrowLeft className="w-4 h-4 mr-2" />戻る</Button>
                  <Button onClick={() => setWorkflow(prev => ({ ...prev, step: 5 }))} disabled={workflow.selectedModelIndex === null} className="gradient-primary">
                    次へ<ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 5: Material & Text */}
          {workflow.step === 5 && (
            <Card className="glass">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Camera className="w-5 h-5 text-primary" />Step 5: 素材と文言</CardTitle>
                <CardDescription>必要素材をアップロードし、サムネイル文言を決定</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {selectedModel && (
                  <div className="grid md:grid-cols-2 gap-4">
                    <img src={selectedModel.imageUrl} alt="" className="aspect-video object-cover rounded-lg" />
                    <div className="space-y-3">
                      <div className="p-3 bg-secondary/30 rounded-lg">
                        <h5 className="font-medium text-sm mb-1">構造説明</h5>
                        <p className="text-sm text-muted-foreground">{selectedModel.description}</p>
                      </div>
                      {selectedModel.suggestedTexts && selectedModel.suggestedTexts.length > 0 && (
                        <div className="p-3 bg-green-500/10 rounded-lg border border-green-500/20">
                          <h5 className="font-medium text-sm mb-2 flex items-center gap-2">
                            <Type className="w-4 h-4 text-green-500" />推奨文言（複数提案）
                          </h5>
                          <div className="space-y-2">
                            {selectedModel.suggestedTexts.map((s, i) => (
                              <button
                                key={i}
                                onClick={() => setWorkflow(prev => ({ ...prev, text: s.text }))}
                                className={`w-full text-left p-2 rounded-lg border transition-all ${
                                  workflow.text === s.text ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'
                                }`}
                              >
                                <p className="font-bold">{s.text}</p>
                                <p className="text-xs text-muted-foreground">{s.reason}</p>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      {selectedModel.requiredMaterials.length > 0 && (
                        <div className="p-3 bg-primary/5 rounded-lg border border-primary/20">
                          <h5 className="font-medium text-sm mb-2 flex items-center gap-2">
                            <Lightbulb className="w-4 h-4 text-yellow-500" />必要な素材（優先度順）
                          </h5>
                          <div className="space-y-2">
                            {selectedModel.requiredMaterials.map((m, i) => (
                              <div key={i} className="flex items-start gap-2 p-2 rounded bg-background/50">
                                <Badge 
                                  variant="outline" 
                                  className={`text-xs shrink-0 ${
                                    m.priority === 'high' ? 'border-red-500 text-red-500' :
                                    m.priority === 'medium' ? 'border-yellow-500 text-yellow-500' :
                                    'border-muted-foreground'
                                  }`}
                                >
                                  {m.priority === 'high' ? '必須' : m.priority === 'medium' ? '推奨' : '任意'}
                                </Badge>
                                <div>
                                  <p className="text-sm font-medium">{m.name}</p>
                                  <p className="text-xs text-muted-foreground">{m.description}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="space-y-3">
                  <label className="text-sm font-medium">素材をアップロード（任意）</label>
                  <label className="block">
                    <div className="border-2 border-dashed border-border rounded-lg p-4 text-center cursor-pointer hover:border-primary/50 transition-colors">
                      <Upload className="w-6 h-6 mx-auto text-muted-foreground mb-1" />
                      <p className="text-sm text-muted-foreground">クリックしてアップロード</p>
                    </div>
                    <input type="file" accept="image/*" multiple onChange={handleMaterialUpload} className="hidden" />
                  </label>
                  {workflow.materials.length > 0 && (
                    <div className="grid grid-cols-4 gap-2">
                      {workflow.materials.map(m => (
                        <div key={m.id} className="relative group">
                          <img src={m.preview} alt="" className="aspect-video object-cover rounded-lg" />
                          <button onClick={() => removeMaterial(m.id)} className="absolute top-1 right-1 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 text-xs">×</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="border-t pt-4 space-y-3">
                  <label className="text-sm font-medium flex items-center gap-2">
                    サムネイル文言 *
                    {workflow.text && <Badge variant="secondary" className="text-xs">{workflow.text.length}文字</Badge>}
                  </label>
                  <div className="flex gap-2">
                    <Textarea
                      value={workflow.text}
                      onChange={(e) => setWorkflow(prev => ({ ...prev, text: e.target.value }))}
                      placeholder="例：衝撃、神回、限界突破"
                      className="min-h-[60px] bg-secondary/50 flex-1"
                    />
                    <Button onClick={generateSuggestionsFromTitle} disabled={isGeneratingSuggestions} variant="outline" className="shrink-0">
                      {isGeneratingSuggestions ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                      <span className="ml-2">AI提案</span>
                    </Button>
                  </div>
                  {textSuggestions.length > 0 && (
                    <div className="space-y-2 p-3 bg-primary/5 rounded-lg border border-primary/20">
                      <h4 className="text-sm font-semibold flex items-center gap-2"><Lightbulb className="w-4 h-4 text-yellow-500" />AI提案</h4>
                      <div className="space-y-2">
                        {textSuggestions.map((s, i) => (
                          <button
                            key={i}
                            onClick={() => setWorkflow(prev => ({ ...prev, text: s.text }))}
                            className={`w-full text-left p-2 rounded-lg border transition-all ${
                              workflow.text === s.text ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'
                            }`}
                          >
                            <p className="font-bold">{s.text}</p>
                            <p className="text-xs text-muted-foreground">{s.reason}</p>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between pt-4">
                  <Button variant="outline" onClick={() => setWorkflow(prev => ({ ...prev, step: 4 }))}><ArrowLeft className="w-4 h-4 mr-2" />戻る</Button>
                  <Button onClick={() => setWorkflow(prev => ({ ...prev, step: 6 }))} disabled={!workflow.text.trim()} className="gradient-primary">
                    次へ<ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 6: AI Generation */}
          {workflow.step === 6 && (
            <Card className="glass">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Wand2 className="w-5 h-5 text-primary" />Step 6: サムネイルを生成</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="p-4 bg-secondary/30 rounded-lg space-y-2 text-sm">
                  <p><span className="font-medium">タイトル:</span> {workflow.videoTitle}</p>
                  <p><span className="font-medium">文言:</span> {workflow.text}</p>
                  <p><span className="font-medium">参考:</span> {workflow.selectedReferences.length}枚</p>
                  {workflow.patternAnalysis && <p><span className="font-medium">パターン:</span> {workflow.patternAnalysis.layout}</p>}
                </div>

                <Button onClick={generateThumbnail} disabled={isGenerating} className="w-full gradient-primary glow-sm h-12 text-lg">
                  {isGenerating ? <><Loader2 className="w-5 h-5 animate-spin mr-2" />生成中...</> : <><Wand2 className="w-5 h-5 mr-2" />サムネイルを生成</>}
                </Button>

                {workflow.generatedImages.length > 0 && (
                  <div className="space-y-4">
                    <h4 className="font-semibold">生成されたサムネイル</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {workflow.generatedImages.map((img, idx) => (
                        <div key={idx} className="relative group">
                          <img src={img} alt="" className="aspect-video object-cover rounded-lg" />
                          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                            <Button size="sm" variant="secondary" onClick={() => downloadImage(img)}>
                              <Download className="w-4 h-4 mr-1" />ダウンロード
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="p-4 bg-secondary/30 rounded-lg space-y-3">
                      <h5 className="font-medium flex items-center gap-2"><Pencil className="w-4 h-4 text-primary" />修正する</h5>
                      <Textarea
                        value={refinementInstruction}
                        onChange={(e) => setRefinementInstruction(e.target.value)}
                        placeholder="例：文字を大きく、背景を暗く..."
                        className="bg-background/50 min-h-[60px]"
                      />
                      <Button
                        onClick={() => refineImage(workflow.generatedImages[workflow.generatedImages.length - 1])}
                        disabled={isRefining || !refinementInstruction.trim()}
                        variant="outline"
                        className="w-full"
                      >
                        {isRefining ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />修正中...</> : <><Pencil className="w-4 h-4 mr-2" />修正指示で再生成</>}
                      </Button>
                    </div>

                    <div className="flex gap-2">
                      <Button onClick={generateThumbnail} disabled={isGenerating} variant="outline"><RefreshCw className="w-4 h-4 mr-2" />別パターン</Button>
                      <Button onClick={resetWorkflow} variant="outline">新規作成</Button>
                    </div>
                  </div>
                )}

                <div className="flex pt-4">
                  <Button variant="outline" onClick={() => setWorkflow(prev => ({ ...prev, step: 5 }))}><ArrowLeft className="w-4 h-4 mr-2" />戻る</Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
