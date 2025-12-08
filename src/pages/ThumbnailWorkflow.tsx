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
  ImageIcon,
  Sparkles,
  RefreshCw,
  Download,
  Copy,
  Wand2,
  Palette,
  Type,
  Camera,
  LayoutGrid,
  Bot,
  Send,
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

interface WorkflowState {
  step: number;
  selectedReferences: ChannelThumbnail[];
  text: string;
  aiAnalysis: string;
  generatedImages: string[];
  isABTest: boolean;
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
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<{role: string; content: string}[]>([]);
  
  const [workflow, setWorkflow] = useState<WorkflowState>({
    step: 1,
    selectedReferences: [],
    text: '',
    aiAnalysis: '',
    generatedImages: [],
    isABTest: false,
  });

  useEffect(() => {
    fetchChannels();
    fetchStoredThumbnails();
  }, [user]);

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

  const analyzeReferences = async () => {
    if (workflow.selectedReferences.length === 0) {
      toast({ title: '選択してください', description: '参考サムネイルを選択してください', variant: 'destructive' });
      return;
    }

    setIsAnalyzing(true);
    try {
      const referenceInfo = workflow.selectedReferences.map(t => ({
        title: t.video_title,
        url: t.thumbnail_url,
        channelType: t.channel_type,
      }));

      const { data, error } = await supabase.functions.invoke('chat', {
        body: {
          messages: [{
            role: 'user',
            content: `以下の参考サムネイルを分析してください。レイアウト、配色、フォントスタイル、構図について詳しく教えてください。また、これらを参考にした新しいサムネイルを作る際の具体的なアドバイスをください。

参考サムネイル:
${referenceInfo.map((r, i) => `${i + 1}. "${r.title}" (${r.channelType === 'own' ? '自チャンネル' : '競合チャンネル'})`).join('\n')}

マークダウン形式で見やすく整理してください。`
          }],
        },
      });

      if (error) throw error;
      
      setWorkflow(prev => ({ ...prev, aiAnalysis: data.content }));
      setChatMessages([{ role: 'assistant', content: data.content }]);
    } catch (error) {
      console.error('Analysis error:', error);
      toast({ title: 'エラー', description: '分析に失敗しました', variant: 'destructive' });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const sendChatMessage = async () => {
    if (!chatInput.trim()) return;
    
    const userMessage = { role: 'user', content: chatInput };
    setChatMessages(prev => [...prev, userMessage]);
    setChatInput('');
    setIsAnalyzing(true);

    try {
      const { data, error } = await supabase.functions.invoke('chat', {
        body: {
          messages: [...chatMessages, userMessage].map(m => ({
            role: m.role,
            content: m.content,
          })),
        },
      });

      if (error) throw error;
      setChatMessages(prev => [...prev, { role: 'assistant', content: data.content }]);
    } catch (error) {
      console.error('Chat error:', error);
      toast({ title: 'エラー', description: 'メッセージ送信に失敗しました', variant: 'destructive' });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const generateThumbnail = async () => {
    if (!workflow.text.trim()) {
      toast({ title: 'テキストを入力', description: 'サムネイルに入れる文言を入力してください', variant: 'destructive' });
      return;
    }

    setIsGenerating(true);
    try {
      const referenceInfo = workflow.selectedReferences.map(t => t.video_title).join(', ');
      
      const prompt = `Create a professional YouTube thumbnail based on these references: ${referenceInfo}. 
The thumbnail should include this text: "${workflow.text}".
Style analysis: ${workflow.aiAnalysis.slice(0, 500)}`;

      const { data, error } = await supabase.functions.invoke('generate-image', {
        body: { prompt },
      });

      if (error) throw error;
      
      if (data.imageUrl) {
        setWorkflow(prev => ({ 
          ...prev, 
          generatedImages: [...prev.generatedImages, data.imageUrl] 
        }));
        
        // Save to thumbnails
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

  const startABTest = () => {
    setWorkflow(prev => ({ 
      ...prev, 
      step: 1, 
      isABTest: true,
      selectedReferences: [],
      aiAnalysis: '',
    }));
    setChatMessages([]);
    toast({ title: 'A/Bテスト', description: '別パターンを作成します。新しい参考サムネイルを選んでください' });
  };

  const ownThumbnails = thumbnails.filter(t => t.channel_type === 'own');
  const competitorThumbnails = thumbnails.filter(t => t.channel_type === 'competitor');

  const steps = [
    { num: 1, title: '参考を選ぶ', icon: LayoutGrid },
    { num: 2, title: '文言を決める', icon: Type },
    { num: 3, title: '素材準備', icon: Camera },
    { num: 4, title: '作成', icon: Wand2 },
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
              ステップに沿って効果的なサムネイルを作成しましょう
            </p>
          </div>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center justify-between bg-card/50 rounded-xl p-4 border border-border">
          {steps.map((s, i) => (
            <div key={s.num} className="flex items-center">
              <button
                onClick={() => workflow.step >= s.num && setWorkflow(prev => ({ ...prev, step: s.num }))}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
                  workflow.step === s.num 
                    ? 'bg-primary text-primary-foreground' 
                    : workflow.step > s.num 
                    ? 'bg-primary/20 text-primary cursor-pointer hover:bg-primary/30' 
                    : 'bg-secondary text-muted-foreground'
                }`}
              >
                <s.icon className="w-4 h-4" />
                <span className="font-medium hidden sm:inline">{s.title}</span>
                <span className="font-medium sm:hidden">{s.num}</span>
              </button>
              {i < steps.length - 1 && (
                <ArrowRight className="w-4 h-4 mx-2 text-muted-foreground" />
              )}
            </div>
          ))}
        </div>

        {/* Step Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Step 1: Select References */}
            {workflow.step === 1 && (
              <Card className="glass">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <LayoutGrid className="w-5 h-5 text-primary" />
                    参考サムネイルを選択
                  </CardTitle>
                  <CardDescription>
                    自チャンネルの過去動画や競合チャンネルから参考にするサムネイルを選んでください（最大5枚）
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
                          サムネイルがありません。チャンネル設定からチャンネルを追加して取得してください。
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
                      onClick={() => {
                        analyzeReferences();
                        setWorkflow(prev => ({ ...prev, step: 2 }));
                      }}
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
                    サムネイルの文言を決める
                  </CardTitle>
                  <CardDescription>
                    参考サムネイルの文字数になるべく近づけましょう
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Textarea
                    value={workflow.text}
                    onChange={(e) => setWorkflow(prev => ({ ...prev, text: e.target.value }))}
                    placeholder="例: 【衝撃】知らないと損する○○の真実"
                    className="min-h-[100px] bg-secondary/50"
                  />
                  <p className="text-sm text-muted-foreground">
                    文字数: {workflow.text.length}文字
                  </p>
                  
                  <div className="flex items-center justify-between pt-4 border-t border-border">
                    <Button
                      variant="outline"
                      onClick={() => setWorkflow(prev => ({ ...prev, step: 1 }))}
                    >
                      <ArrowLeft className="w-4 h-4 mr-2" />
                      戻る
                    </Button>
                    <Button
                      onClick={() => setWorkflow(prev => ({ ...prev, step: 3 }))}
                      className="gradient-primary"
                    >
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
                    素材を準備する
                  </CardTitle>
                  <CardDescription>
                    必要な写真や画像素材を撮影・準備してください
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="bg-secondary/30 rounded-lg p-6 text-center space-y-4">
                    <Camera className="w-12 h-12 mx-auto text-muted-foreground" />
                    <div>
                      <h3 className="font-semibold">素材準備のヒント</h3>
                      <ul className="text-sm text-muted-foreground mt-2 space-y-1 text-left max-w-md mx-auto">
                        <li>• 表情豊かな人物写真</li>
                        <li>• 明るく鮮やかな色使い</li>
                        <li>• 高解像度の画像（1280x720px以上）</li>
                        <li>• 背景がシンプルな素材</li>
                      </ul>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between pt-4 border-t border-border">
                    <Button
                      variant="outline"
                      onClick={() => setWorkflow(prev => ({ ...prev, step: 2 }))}
                    >
                      <ArrowLeft className="w-4 h-4 mr-2" />
                      戻る
                    </Button>
                    <Button
                      onClick={() => setWorkflow(prev => ({ ...prev, step: 4 }))}
                      className="gradient-primary"
                    >
                      作成へ進む
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
                    サムネイルを作成
                  </CardTitle>
                  <CardDescription>
                    AIが参考サムネイルのスタイルを踏まえて画像を生成します
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Summary */}
                  <div className="bg-secondary/30 rounded-lg p-4 space-y-3">
                    <div>
                      <p className="text-sm text-muted-foreground">参考サムネイル</p>
                      <div className="flex gap-2 mt-1">
                        {workflow.selectedReferences.map(t => (
                          <img
                            key={t.id}
                            src={t.thumbnail_url}
                            alt={t.video_title}
                            className="w-16 h-9 object-cover rounded"
                          />
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">文言</p>
                      <p className="font-medium">{workflow.text || '(未設定)'}</p>
                    </div>
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
                                <Download className="w-4 h-4" />
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
                        onClick={() => setWorkflow(prev => ({ ...prev, step: 5 }))}
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
                    A/Bテスト用バリエーション
                  </CardTitle>
                  <CardDescription>
                    別の参考サムネイルや文言で複数パターンを作成しましょう
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {workflow.generatedImages.map((url, i) => (
                      <div key={i} className="space-y-2">
                        <Badge>パターン {i + 1}</Badge>
                        <img
                          src={url}
                          alt={`Pattern ${i + 1}`}
                          className="w-full aspect-video object-cover rounded-lg"
                        />
                      </div>
                    ))}
                  </div>

                  <Button
                    onClick={startABTest}
                    variant="outline"
                    className="w-full"
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    別パターンを作成（Step 1に戻る）
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar - AI Analysis & Chat */}
          <div className="space-y-4">
            {/* Selected References */}
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

            {/* AI Analysis Chat */}
            <Card className="glass">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Bot className="w-4 h-4 text-primary" />
                  AIアシスタント
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <ScrollArea className="h-[300px]">
                  <div className="space-y-3 pr-4">
                    {chatMessages.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-8">
                        参考サムネイルを選択すると、AIが分析結果を表示します
                      </p>
                    ) : (
                      chatMessages.map((msg, i) => (
                        <div
                          key={i}
                          className={`text-sm ${msg.role === 'assistant' ? 'bg-secondary/50 rounded-lg p-3' : 'bg-primary/10 rounded-lg p-3'}`}
                        >
                          {msg.role === 'assistant' ? (
                            <div className="prose prose-sm prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                              <ReactMarkdown>{msg.content}</ReactMarkdown>
                            </div>
                          ) : (
                            <p>{msg.content}</p>
                          )}
                        </div>
                      ))
                    )}
                    {isAnalyzing && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        分析中...
                      </div>
                    )}
                  </div>
                </ScrollArea>

                <div className="flex gap-2 pt-2 border-t border-border">
                  <Input
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="質問を入力..."
                    onKeyDown={(e) => e.key === 'Enter' && sendChatMessage()}
                    className="text-sm"
                  />
                  <Button
                    size="icon"
                    onClick={sendChatMessage}
                    disabled={!chatInput.trim() || isAnalyzing}
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
