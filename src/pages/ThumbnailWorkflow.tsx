import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import ReactMarkdown from 'react-markdown';
import {
  ArrowRight,
  ArrowLeft,
  Check,
  Loader2,
  Sparkles,
  RefreshCw,
  Download,
  Copy,
  Wand2,
  Type,
  Camera,
  LayoutGrid,
  Bot,
  Upload,
  Lightbulb,
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
}

interface WorkflowState {
  step: number;
  selectedReferences: ChannelThumbnail[];
  text: string;
  materials: MaterialItem[];
  generatedImages: string[];
  isABTest: boolean;
}

interface AIGuidance {
  step: number;
  title: string;
  content: string;
  suggestions: string[];
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
  
  const [workflow, setWorkflow] = useState<WorkflowState>({
    step: 1,
    selectedReferences: [],
    text: '',
    materials: [],
    generatedImages: [],
    isABTest: false,
  });

  const [aiGuidance, setAiGuidance] = useState<AIGuidance | null>(null);

  useEffect(() => {
    fetchChannels();
    fetchStoredThumbnails();
  }, [user]);

  // Initial guidance for step 1
  useEffect(() => {
    if (workflow.step === 1 && !aiGuidance) {
      setAiGuidance({
        step: 1,
        title: 'まずは参考サムネイルを選びましょう',
        content: '効果的なサムネイルを作るには、成功している参考事例を分析することが重要です。自分のチャンネルの過去の人気動画や、競合チャンネルの視聴数が多い動画のサムネイルを選んでください。',
        suggestions: [
          '自チャンネルから2〜3枚選ぶ',
          '競合チャンネルから1〜2枚選ぶ',
          '似たジャンルの人気動画を参考にする',
        ],
      });
    }
  }, [workflow.step]);

  const fetchChannels = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('channel_settings')
      .select('*')
      .eq('user_id', user.id);
    setChannels(data || []);
  };

  const fetchStoredThumbnails = async () => {
    if (!user) return;
    setIsLoadingThumbnails(true);
    
    const { data: thumbData } = await supabase
      .from('channel_thumbnails')
      .select(`
        *,
        channel_settings!inner(channel_name, channel_type)
      `)
      .eq('user_id', user.id)
      .order('published_at', { ascending: false });

    if (thumbData) {
      setThumbnails(thumbData.map((t: any) => ({
        ...t,
        channel_name: t.channel_settings?.channel_name,
        channel_type: t.channel_settings?.channel_type,
      })));
    }
    setIsLoadingThumbnails(false);
  };

  const fetchYouTubeThumbnails = async (channel: Channel) => {
    if (!channel.channel_url) {
      toast({ title: 'エラー', description: 'チャンネルURLが設定されていません', variant: 'destructive' });
      return;
    }

    setIsFetchingFromYouTube(true);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-youtube-thumbnails', {
        body: { channelUrl: channel.channel_url, channelId: channel.id },
      });

      if (error) throw error;

      toast({ title: '取得完了', description: `${data.count}件のサムネイルを取得しました` });
      await fetchStoredThumbnails();
    } catch (error) {
      console.error('Fetch error:', error);
      toast({ title: 'エラー', description: 'サムネイルの取得に失敗しました', variant: 'destructive' });
    } finally {
      setIsFetchingFromYouTube(false);
    }
  };

  const toggleReferenceSelection = (thumb: ChannelThumbnail) => {
    setWorkflow(prev => {
      const isSelected = prev.selectedReferences.some(t => t.id === thumb.id);
      if (isSelected) {
        return { ...prev, selectedReferences: prev.selectedReferences.filter(t => t.id !== thumb.id) };
      } else if (prev.selectedReferences.length < 5) {
        return { ...prev, selectedReferences: [...prev.selectedReferences, thumb] };
      }
      return prev;
    });
  };

  const analyzeAndProceedToStep2 = async () => {
    if (workflow.selectedReferences.length === 0) {
      toast({ title: '選択してください', description: '参考サムネイルを選択してください', variant: 'destructive' });
      return;
    }

    setIsAnalyzing(true);
    try {
      const referenceInfo = workflow.selectedReferences.map(t => ({
        title: t.video_title,
        channelType: t.channel_type === 'own' ? '自チャンネル' : '競合チャンネル',
      }));

      const { data, error } = await supabase.functions.invoke('chat', {
        body: {
          messages: [{
            role: 'user',
            content: `以下の参考サムネイルを分析し、文言（タイトルテキスト）の提案をしてください。

参考サムネイル:
${referenceInfo.map((r, i) => `${i + 1}. "${r.title}" (${r.channelType})`).join('\n')}

以下の形式で回答してください:
1. 参考サムネイルの文言の特徴（短く）
2. 効果的な文言の3つの提案（具体的に）
3. 文字数の目安

簡潔に箇条書きで回答してください。`
          }],
        },
      });

      if (error) throw error;
      
      // Parse suggestions from AI response
      const suggestions = extractSuggestionsFromResponse(data.content);
      
      setAiGuidance({
        step: 2,
        title: '文言を決めましょう',
        content: data.content,
        suggestions,
      });
      
      setWorkflow(prev => ({ ...prev, step: 2 }));
    } catch (error) {
      console.error('Analysis error:', error);
      toast({ title: 'エラー', description: '分析に失敗しました', variant: 'destructive' });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const extractSuggestionsFromResponse = (content: string): string[] => {
    // Simple extraction - look for numbered items or bullet points
    const lines = content.split('\n');
    const suggestions: string[] = [];
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.match(/^[「『].*[」』]$/) || trimmed.match(/^[-•]\s*[「『].*[」』]/)) {
        suggestions.push(trimmed.replace(/^[-•]\s*/, ''));
      }
    }
    
    return suggestions.slice(0, 3);
  };

  const proceedToStep3 = async () => {
    if (!workflow.text.trim()) {
      toast({ title: 'テキストを入力', description: 'サムネイルに入れる文言を入力してください', variant: 'destructive' });
      return;
    }

    setIsAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke('chat', {
        body: {
          messages: [{
            role: 'user',
            content: `サムネイル文言「${workflow.text}」に合う素材（写真・画像）の準備についてアドバイスしてください。

以下の点について簡潔にアドバイス:
1. 必要な人物の表情や構図
2. 背景や色使いの推奨
3. 用意すべき素材のリスト

箇条書きで簡潔に回答してください。`
          }],
        },
      });

      if (error) throw error;
      
      setAiGuidance({
        step: 3,
        title: '素材を準備しましょう',
        content: data.content,
        suggestions: [
          '人物写真を撮影する',
          '背景画像を用意する',
          'アイコン・装飾素材を集める',
        ],
      });
      
      setWorkflow(prev => ({ ...prev, step: 3 }));
    } catch (error) {
      console.error('Analysis error:', error);
      // Fallback guidance
      setAiGuidance({
        step: 3,
        title: '素材を準備しましょう',
        content: '効果的なサムネイルには以下の素材が必要です：\n\n• **人物写真**: 表情豊かなもの\n• **背景**: シンプルで目立つ色\n• **装飾**: 矢印やフレームなど',
        suggestions: [
          '人物写真を撮影する',
          '背景画像を用意する',
          'アイコン・装飾素材を集める',
        ],
      });
      setWorkflow(prev => ({ ...prev, step: 3 }));
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleMaterialUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newMaterials: MaterialItem[] = Array.from(files).map(file => ({
      id: crypto.randomUUID(),
      file,
      preview: URL.createObjectURL(file),
    }));

    setWorkflow(prev => ({
      ...prev,
      materials: [...prev.materials, ...newMaterials].slice(0, 5),
    }));
  };

  const removeMaterial = (id: string) => {
    setWorkflow(prev => ({
      ...prev,
      materials: prev.materials.filter(m => m.id !== id),
    }));
  };

  const proceedToStep4 = async () => {
    setIsAnalyzing(true);
    try {
      const referenceInfo = workflow.selectedReferences.map(t => t.video_title).join(', ');
      
      const { data, error } = await supabase.functions.invoke('chat', {
        body: {
          messages: [{
            role: 'user',
            content: `サムネイル生成の準備が完了しました。

参考サムネイル: ${referenceInfo}
文言: ${workflow.text}
素材数: ${workflow.materials.length}枚

生成前の最終チェックポイントと、期待できる仕上がりについて簡潔に説明してください。`
          }],
        },
      });

      if (error) throw error;
      
      setAiGuidance({
        step: 4,
        title: 'AIで生成しましょう',
        content: data.content,
        suggestions: [
          '生成ボタンをクリック',
          '気に入らなければ再生成',
          '複数パターン生成も可能',
        ],
      });
      
      setWorkflow(prev => ({ ...prev, step: 4 }));
    } catch (error) {
      // Fallback
      setAiGuidance({
        step: 4,
        title: 'AIで生成しましょう',
        content: '準備が整いました！「サムネイルを生成」ボタンをクリックして、AIにサムネイルを作成してもらいましょう。',
        suggestions: [
          '生成ボタンをクリック',
          '気に入らなければ再生成',
          '複数パターン生成も可能',
        ],
      });
      setWorkflow(prev => ({ ...prev, step: 4 }));
    } finally {
      setIsAnalyzing(false);
    }
  };

  const generateThumbnail = async () => {
    setIsGenerating(true);
    try {
      const referenceInfo = workflow.selectedReferences.map(t => t.video_title).join(', ');
      
      const prompt = `Create a professional YouTube thumbnail.
References: ${referenceInfo}
Text to include: "${workflow.text}"
Style: Bold, eye-catching, high contrast colors, professional design`;

      const { data, error } = await supabase.functions.invoke('generate-image', {
        body: { prompt },
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
        
        // Update guidance after generation
        setAiGuidance({
          step: 4,
          title: 'サムネイルが完成しました！',
          content: '素晴らしいサムネイルができました！気に入った場合は次のステップでA/Bテスト用のバリエーションを作成しましょう。別のデザインを試したい場合は、再度生成ボタンを押してください。',
          suggestions: [
            'A/Bテストへ進む',
            '別パターンを生成',
            'ダウンロードして使用',
          ],
        });
      }
    } catch (error) {
      console.error('Generate error:', error);
      toast({ title: 'エラー', description: '画像生成に失敗しました', variant: 'destructive' });
    } finally {
      setIsGenerating(false);
    }
  };

  const proceedToStep5 = async () => {
    setAiGuidance({
      step: 5,
      title: 'A/Bテスト用バリエーションを作成',
      content: '効果的なA/Bテストのために、以下のような変更を加えたバリエーションを作成することをお勧めします：\n\n• **文言の変更**: 別の表現やキーワードを試す\n• **色使いの変更**: 背景色やテキスト色を変える\n• **構図の変更**: 人物の配置や大きさを変える\n\n「別パターンを作成」ボタンでStep 1に戻り、違う参考サムネイルを選んで新しいパターンを作りましょう。',
      suggestions: [
        '文言を変えて新パターン作成',
        '別の参考サムネイルで作成',
        '色違いバージョンを作成',
      ],
    });
    setWorkflow(prev => ({ ...prev, step: 5 }));
  };

  const startABTest = () => {
    setWorkflow(prev => ({ 
      ...prev, 
      step: 1, 
      isABTest: true,
      selectedReferences: [],
      text: '',
      materials: [],
    }));
    setAiGuidance({
      step: 1,
      title: 'A/Bテスト用の新パターンを作成',
      content: '別パターンを作成します。前回とは違う参考サムネイルを選んで、新しいスタイルを試してみましょう。',
      suggestions: [
        '前回と違うチャンネルから選ぶ',
        '違うスタイルのサムネイルを参考に',
        '競合の人気動画を分析',
      ],
    });
    toast({ title: 'A/Bテスト', description: '別パターンを作成します' });
  };

  const ownThumbnails = thumbnails.filter(t => t.channel_type === 'own');
  const competitorThumbnails = thumbnails.filter(t => t.channel_type === 'competitor');

  const steps = [
    { num: 1, title: '参考選択', icon: LayoutGrid },
    { num: 2, title: '文言決定', icon: Type },
    { num: 3, title: '素材準備', icon: Camera },
    { num: 4, title: 'AI生成', icon: Wand2 },
    { num: 5, title: 'A/Bテスト', icon: Copy },
  ];

  return (
    <div className="min-h-[calc(100vh-3.5rem)] p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <Sparkles className="w-8 h-8 text-primary" />
              サムネイル作成ワークフロー
              {workflow.isABTest && (
                <Badge variant="secondary" className="ml-2">A/Bテスト中</Badge>
              )}
            </h1>
            <p className="text-muted-foreground mt-1">
              AIガイドに沿って効果的なサムネイルを作成しましょう
            </p>
          </div>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center justify-between bg-card/50 rounded-xl p-4 border border-border overflow-x-auto">
          {steps.map((s, i) => (
            <div key={s.num} className="flex items-center flex-shrink-0">
              <button
                onClick={() => workflow.step >= s.num && setWorkflow(prev => ({ ...prev, step: s.num }))}
                disabled={workflow.step < s.num}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all ${
                  workflow.step === s.num 
                    ? 'bg-primary text-primary-foreground' 
                    : workflow.step > s.num 
                    ? 'bg-primary/20 text-primary cursor-pointer hover:bg-primary/30' 
                    : 'bg-secondary text-muted-foreground cursor-not-allowed'
                }`}
              >
                <s.icon className="w-4 h-4" />
                <span className="font-medium text-sm hidden sm:inline">{s.title}</span>
                <span className="font-medium sm:hidden">{s.num}</span>
              </button>
              {i < steps.length - 1 && (
                <ArrowRight className="w-4 h-4 mx-1 text-muted-foreground flex-shrink-0" />
              )}
            </div>
          ))}
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Step Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Step 1: Select References */}
            {workflow.step === 1 && (
              <Card className="glass">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <LayoutGrid className="w-5 h-5 text-primary" />
                    Step 1: 参考サムネイルを選択
                  </CardTitle>
                  <CardDescription>
                    自チャンネルや競合チャンネルから参考にするサムネイルを選んでください（最大5枚）
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Fetch buttons */}
                  <div className="flex flex-wrap gap-2">
                    {channels.map(channel => (
                      <Button
                        key={channel.id}
                        variant="outline"
                        size="sm"
                        onClick={() => fetchYouTubeThumbnails(channel)}
                        disabled={isFetchingFromYouTube}
                      >
                        {isFetchingFromYouTube ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <RefreshCw className="w-4 h-4 mr-2" />
                        )}
                        {channel.channel_name}から取得
                      </Button>
                    ))}
                    {channels.length === 0 && (
                      <p className="text-sm text-muted-foreground">
                        チャンネル設定からチャンネルを追加してください
                      </p>
                    )}
                  </div>

                  <Tabs defaultValue="own" className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="own">自チャンネル ({ownThumbnails.length})</TabsTrigger>
                      <TabsTrigger value="competitor">競合チャンネル ({competitorThumbnails.length})</TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="own" className="mt-4">
                      {isLoadingThumbnails ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="w-6 h-6 animate-spin" />
                        </div>
                      ) : ownThumbnails.length === 0 ? (
                        <p className="text-center text-muted-foreground py-8">
                          サムネイルがありません。上のボタンから取得してください。
                        </p>
                      ) : (
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                          {ownThumbnails.map(thumb => (
                            <div
                              key={thumb.id}
                              onClick={() => toggleReferenceSelection(thumb)}
                              className={`relative cursor-pointer rounded-lg overflow-hidden border-2 transition-all ${
                                workflow.selectedReferences.some(t => t.id === thumb.id)
                                  ? 'border-primary ring-2 ring-primary/30'
                                  : 'border-transparent hover:border-primary/50'
                              }`}
                            >
                              <img
                                src={thumb.thumbnail_url}
                                alt={thumb.video_title}
                                className="aspect-video object-cover w-full"
                              />
                              {workflow.selectedReferences.some(t => t.id === thumb.id) && (
                                <div className="absolute top-2 right-2 w-6 h-6 bg-primary rounded-full flex items-center justify-center">
                                  <Check className="w-4 h-4 text-primary-foreground" />
                                </div>
                              )}
                              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                                <p className="text-xs text-white line-clamp-2">{thumb.video_title}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </TabsContent>
                    
                    <TabsContent value="competitor" className="mt-4">
                      {isLoadingThumbnails ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="w-6 h-6 animate-spin" />
                        </div>
                      ) : competitorThumbnails.length === 0 ? (
                        <p className="text-center text-muted-foreground py-8">
                          競合チャンネルのサムネイルがありません。チャンネル設定から競合チャンネルを追加してください。
                        </p>
                      ) : (
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                          {competitorThumbnails.map(thumb => (
                            <div
                              key={thumb.id}
                              onClick={() => toggleReferenceSelection(thumb)}
                              className={`relative cursor-pointer rounded-lg overflow-hidden border-2 transition-all ${
                                workflow.selectedReferences.some(t => t.id === thumb.id)
                                  ? 'border-primary ring-2 ring-primary/30'
                                  : 'border-transparent hover:border-primary/50'
                              }`}
                            >
                              <img
                                src={thumb.thumbnail_url}
                                alt={thumb.video_title}
                                className="aspect-video object-cover w-full"
                              />
                              {workflow.selectedReferences.some(t => t.id === thumb.id) && (
                                <div className="absolute top-2 right-2 w-6 h-6 bg-primary rounded-full flex items-center justify-center">
                                  <Check className="w-4 h-4 text-primary-foreground" />
                                </div>
                              )}
                              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                                <p className="text-xs text-white line-clamp-2">{thumb.video_title}</p>
                                <Badge variant="secondary" className="mt-1 text-xs">{thumb.channel_name}</Badge>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </TabsContent>
                  </Tabs>

                  <div className="flex items-center justify-between pt-4 border-t border-border">
                    <p className="text-sm text-muted-foreground">
                      {workflow.selectedReferences.length}/5 選択中
                    </p>
                    <Button
                      onClick={analyzeAndProceedToStep2}
                      disabled={workflow.selectedReferences.length === 0 || isAnalyzing}
                      className="gradient-primary"
                    >
                      {isAnalyzing ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Sparkles className="w-4 h-4 mr-2" />
                      )}
                      AIで分析して次へ
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Step 2: Decide Text */}
            {workflow.step === 2 && (
              <Card className="glass">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Type className="w-5 h-5 text-primary" />
                    Step 2: 文言を決定
                  </CardTitle>
                  <CardDescription>
                    サムネイルに表示するテキストを入力してください
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* AI Suggestion Quick Apply */}
                  {aiGuidance?.suggestions && aiGuidance.suggestions.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-sm font-medium flex items-center gap-2">
                        <Lightbulb className="w-4 h-4 text-yellow-500" />
                        AIの提案をクリックして使用:
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {aiGuidance.suggestions.map((suggestion, idx) => (
                          <Button
                            key={idx}
                            variant="outline"
                            size="sm"
                            onClick={() => setWorkflow(prev => ({ ...prev, text: suggestion.replace(/[「」『』]/g, '') }))}
                            className="text-xs"
                          >
                            {suggestion}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  <div className="space-y-2">
                    <label className="text-sm font-medium">サムネイルに表示するテキスト</label>
                    <Textarea
                      value={workflow.text}
                      onChange={(e) => setWorkflow(prev => ({ ...prev, text: e.target.value }))}
                      placeholder="例: 【衝撃】知らないと損する○○の真実"
                      className="min-h-[100px] bg-secondary/50"
                    />
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      <span>文字数: {workflow.text.length}文字</span>
                      <span>推奨: 15〜25文字</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between pt-4 border-t border-border">
                    <Button
                      variant="outline"
                      onClick={() => setWorkflow(prev => ({ ...prev, step: 1 }))}
                    >
                      <ArrowLeft className="w-4 h-4 mr-2" />
                      戻る
                    </Button>
                    <Button
                      onClick={proceedToStep3}
                      disabled={!workflow.text.trim() || isAnalyzing}
                      className="gradient-primary"
                    >
                      {isAnalyzing ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : null}
                      次へ
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Step 3: Prepare Materials */}
            {workflow.step === 3 && (
              <Card className="glass">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Camera className="w-5 h-5 text-primary" />
                    Step 3: 素材準備
                  </CardTitle>
                  <CardDescription>
                    サムネイルに使用する画像素材をアップロードしてください（任意）
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Upload Area */}
                  <label className="block">
                    <div className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors">
                      <Upload className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                      <p className="text-sm text-muted-foreground">
                        クリックまたはドラッグ&ドロップで画像をアップロード
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        PNG, JPG, WEBP（最大5枚）
                      </p>
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleMaterialUpload}
                      className="hidden"
                    />
                  </label>

                  {/* Uploaded Materials */}
                  {workflow.materials.length > 0 && (
                    <div className="grid grid-cols-3 gap-3">
                      {workflow.materials.map(m => (
                        <div key={m.id} className="relative group">
                          <img
                            src={m.preview}
                            alt="Material"
                            className="aspect-video object-cover rounded-lg"
                          />
                          <button
                            onClick={() => removeMaterial(m.id)}
                            className="absolute top-1 right-1 w-6 h-6 bg-destructive text-destructive-foreground rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-xs"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  <div className="flex items-center justify-between pt-4 border-t border-border">
                    <Button
                      variant="outline"
                      onClick={() => setWorkflow(prev => ({ ...prev, step: 2 }))}
                    >
                      <ArrowLeft className="w-4 h-4 mr-2" />
                      戻る
                    </Button>
                    <Button
                      onClick={proceedToStep4}
                      disabled={isAnalyzing}
                      className="gradient-primary"
                    >
                      {isAnalyzing ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : null}
                      生成へ進む
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Step 4: Generate */}
            {workflow.step === 4 && (
              <Card className="glass">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Wand2 className="w-5 h-5 text-primary" />
                    Step 4: AIで生成
                  </CardTitle>
                  <CardDescription>
                    設定した内容でサムネイルを生成します
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Summary */}
                  <div className="bg-secondary/30 rounded-lg p-4 space-y-3">
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">参考サムネイル</p>
                      <div className="flex gap-2 flex-wrap">
                        {workflow.selectedReferences.map(t => (
                          <img
                            key={t.id}
                            src={t.thumbnail_url}
                            alt={t.video_title}
                            className="w-20 h-12 object-cover rounded"
                          />
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">文言</p>
                      <p className="font-medium">{workflow.text}</p>
                    </div>
                    {workflow.materials.length > 0 && (
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">素材</p>
                        <div className="flex gap-2">
                          {workflow.materials.map(m => (
                            <img
                              key={m.id}
                              src={m.preview}
                              alt="Material"
                              className="w-16 h-10 object-cover rounded"
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <Button
                    onClick={generateThumbnail}
                    disabled={isGenerating}
                    className="w-full gradient-primary glow-sm"
                    size="lg"
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        生成中...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-5 h-5 mr-2" />
                        サムネイルを生成
                      </>
                    )}
                  </Button>

                  {/* Generated Images */}
                  {workflow.generatedImages.length > 0 && (
                    <div className="space-y-4">
                      <h3 className="font-semibold">生成されたサムネイル</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {workflow.generatedImages.map((url, i) => (
                          <div key={i} className="relative group">
                            <img
                              src={url}
                              alt={`Generated ${i + 1}`}
                              className="w-full aspect-video object-cover rounded-lg"
                            />
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 rounded-lg">
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => window.open(url, '_blank')}
                              >
                                <Download className="w-4 h-4 mr-1" />
                                ダウンロード
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-4 border-t border-border">
                    <Button
                      variant="outline"
                      onClick={() => setWorkflow(prev => ({ ...prev, step: 3 }))}
                    >
                      <ArrowLeft className="w-4 h-4 mr-2" />
                      戻る
                    </Button>
                    {workflow.generatedImages.length > 0 && (
                      <Button
                        onClick={proceedToStep5}
                        className="gradient-primary"
                      >
                        A/Bテストへ
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Step 5: A/B Test */}
            {workflow.step === 5 && (
              <Card className="glass">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Copy className="w-5 h-5 text-primary" />
                    Step 5: A/Bテスト用バリエーション
                  </CardTitle>
                  <CardDescription>
                    複数パターンを作成して効果を比較しましょう
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Current Patterns */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {workflow.generatedImages.map((url, i) => (
                      <div key={i} className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Badge>パターン {i + 1}</Badge>
                          {i === 0 && <Badge variant="outline">オリジナル</Badge>}
                        </div>
                        <img
                          src={url}
                          alt={`Pattern ${i + 1}`}
                          className="w-full aspect-video object-cover rounded-lg"
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full"
                          onClick={() => window.open(url, '_blank')}
                        >
                          <Download className="w-4 h-4 mr-1" />
                          ダウンロード
                        </Button>
                      </div>
                    ))}
                  </div>

                  <Button
                    onClick={startABTest}
                    variant="outline"
                    className="w-full"
                    size="lg"
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    別パターンを作成（Step 1に戻る）
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>

          {/* AI Guidance Sidebar */}
          <div className="space-y-4">
            {/* Selected References Summary */}
            {workflow.selectedReferences.length > 0 && (
              <Card className="glass">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">選択中の参考サムネイル</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-2">
                    {workflow.selectedReferences.map(t => (
                      <img
                        key={t.id}
                        src={t.thumbnail_url}
                        alt={t.video_title}
                        className="aspect-video object-cover rounded"
                      />
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* AI Guidance Card */}
            <Card className="glass border-primary/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Bot className="w-4 h-4 text-primary" />
                  AIガイド
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {isAnalyzing ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    分析中...
                  </div>
                ) : aiGuidance ? (
                  <>
                    <div className="flex items-start gap-2">
                      <Lightbulb className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                      <h3 className="font-semibold text-sm">{aiGuidance.title}</h3>
                    </div>
                    
                    <ScrollArea className="h-[200px]">
                      <div className="prose prose-sm prose-invert max-w-none text-sm [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                        <ReactMarkdown>{aiGuidance.content}</ReactMarkdown>
                      </div>
                    </ScrollArea>

                    {aiGuidance.suggestions.length > 0 && (
                      <div className="space-y-2 pt-3 border-t border-border">
                        <p className="text-xs text-muted-foreground font-medium">次のアクション:</p>
                        <div className="flex flex-wrap gap-1">
                          {aiGuidance.suggestions.map((s, i) => (
                            <Badge key={i} variant="secondary" className="text-xs">
                              {s}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    ワークフローを開始してください
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Current Text Summary (Steps 3+) */}
            {workflow.step >= 3 && workflow.text && (
              <Card className="glass">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">設定中の文言</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm font-medium">{workflow.text}</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
