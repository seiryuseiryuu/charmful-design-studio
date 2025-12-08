import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import {
  Send,
  Loader2,
  Sparkles,
  User,
  Bot,
  ImageIcon,
  Download,
  RefreshCw,
  Plus,
  MessageSquare,
  Trash2,
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  imageUrl?: string;
}

interface Conversation {
  id: string;
  title: string;
  created_at: string;
}

export default function Chat() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchConversations();
  }, [user]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const fetchConversations = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('conversations')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });
    setConversations(data || []);
  };

  const fetchMessages = async (conversationId: string) => {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });
    
    setMessages(
      data?.map((m) => ({
        id: m.id,
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })) || []
    );
  };

  const createNewConversation = async () => {
    if (!user) return;
    
    const { data, error } = await supabase
      .from('conversations')
      .insert({ user_id: user.id, title: '新しい会話' })
      .select()
      .single();

    if (error) {
      toast({ title: 'エラー', description: 'チャットを作成できませんでした', variant: 'destructive' });
      return null;
    }

    setConversations((prev) => [data, ...prev]);
    setCurrentConversationId(data.id);
    setMessages([]);
    return data.id;
  };

  const selectConversation = async (conversationId: string) => {
    setCurrentConversationId(conversationId);
    await fetchMessages(conversationId);
  };

  const deleteConversation = async (conversationId: string) => {
    await supabase.from('conversations').delete().eq('id', conversationId);
    setConversations((prev) => prev.filter((c) => c.id !== conversationId));
    if (currentConversationId === conversationId) {
      setCurrentConversationId(null);
      setMessages([]);
    }
    toast({ title: '削除完了', description: '会話を削除しました' });
  };

  const sendMessage = async () => {
    if (!input.trim() || isLoading || !user) return;

    let conversationId = currentConversationId;
    if (!conversationId) {
      conversationId = await createNewConversation();
      if (!conversationId) return;
    }

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    // Save user message
    await supabase.from('messages').insert({
      conversation_id: conversationId,
      user_id: user.id,
      role: 'user',
      content: input,
    });

    // Update conversation title if first message
    if (messages.length === 0) {
      const title = input.slice(0, 50) + (input.length > 50 ? '...' : '');
      await supabase.from('conversations').update({ title }).eq('id', conversationId);
      setConversations((prev) =>
        prev.map((c) => (c.id === conversationId ? { ...c, title } : c))
      );
    }

    try {
      const response = await supabase.functions.invoke('chat', {
        body: {
          messages: [...messages, userMessage].map((m) => ({
            role: m.role,
            content: m.content,
          })),
        },
      });

      if (response.error) throw response.error;

      const assistantContent = response.data?.content || response.data?.message || 'すみません、応答を生成できませんでした。';
      
      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: assistantContent,
      };

      setMessages((prev) => [...prev, assistantMessage]);

      // Save assistant message
      await supabase.from('messages').insert({
        conversation_id: conversationId,
        user_id: user.id,
        role: 'assistant',
        content: assistantContent,
      });
    } catch (error) {
      console.error('Chat error:', error);
      toast({
        title: 'エラー',
        description: 'メッセージの送信に失敗しました',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const generateImage = async (prompt: string) => {
    if (!user || !currentConversationId) return;
    
    setIsGeneratingImage(true);
    
    try {
      const response = await supabase.functions.invoke('generate-image', {
        body: { prompt },
      });

      if (response.error) throw response.error;

      const imageUrl = response.data?.imageUrl;
      if (!imageUrl) throw new Error('画像URLが取得できませんでした');

      // Save thumbnail
      await supabase.from('thumbnails').insert({
        user_id: user.id,
        conversation_id: currentConversationId,
        image_url: imageUrl,
        prompt,
        title: prompt.slice(0, 100),
      });

      const imageMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: 'サムネイルを生成しました！',
        imageUrl,
      };

      setMessages((prev) => [...prev, imageMessage]);

      await supabase.from('messages').insert({
        conversation_id: currentConversationId,
        user_id: user.id,
        role: 'assistant',
        content: `[画像生成] ${prompt}`,
      });

      toast({ title: '生成完了', description: 'サムネイルが生成されました' });
    } catch (error) {
      console.error('Image generation error:', error);
      toast({
        title: 'エラー',
        description: '画像の生成に失敗しました',
        variant: 'destructive',
      });
    } finally {
      setIsGeneratingImage(false);
    }
  };

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      {/* Conversation List */}
      <div className="w-64 border-r border-border bg-card/50 flex flex-col">
        <div className="p-4 border-b border-border">
          <Button onClick={createNewConversation} className="w-full gradient-primary glow-sm">
            <Plus className="w-4 h-4 mr-2" />
            新しいチャット
          </Button>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {conversations.map((conv) => (
              <div
                key={conv.id}
                className={`group flex items-center gap-2 p-3 rounded-lg cursor-pointer transition-colors ${
                  currentConversationId === conv.id
                    ? 'bg-primary/10 text-foreground'
                    : 'hover:bg-secondary text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => selectConversation(conv.id)}
              >
                <MessageSquare className="w-4 h-4 shrink-0" />
                <span className="flex-1 truncate text-sm">{conv.title}</span>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-6 h-6 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>会話を削除しますか？</AlertDialogTitle>
                      <AlertDialogDescription>
                        この操作は取り消せません。会話とすべてのメッセージが削除されます。
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>キャンセル</AlertDialogCancel>
                      <AlertDialogAction onClick={() => deleteConversation(conv.id)}>
                        削除
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col">
        {currentConversationId ? (
          <>
            <ScrollArea ref={scrollRef} className="flex-1 p-4">
              <div className="max-w-3xl mx-auto space-y-4">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex gap-3 animate-slide-up ${
                      message.role === 'user' ? 'justify-end' : 'justify-start'
                    }`}
                  >
                    {message.role === 'assistant' && (
                      <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center shrink-0">
                        <Bot className="w-4 h-4 text-primary-foreground" />
                      </div>
                    )}
                    <Card
                      className={`max-w-[80%] ${
                        message.role === 'user'
                          ? 'bg-primary text-primary-foreground'
                          : 'glass'
                      }`}
                    >
                      <CardContent className="p-3">
                        <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                        {message.imageUrl && (
                          <div className="mt-3 space-y-2">
                            <img
                              src={message.imageUrl}
                              alt="Generated thumbnail"
                              className="rounded-lg max-w-full"
                            />
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => window.open(message.imageUrl, '_blank')}
                              >
                                <Download className="w-3 h-3 mr-1" />
                                ダウンロード
                              </Button>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                    {message.role === 'user' && (
                      <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                        <User className="w-4 h-4" />
                      </div>
                    )}
                  </div>
                ))}
                {(isLoading || isGeneratingImage) && (
                  <div className="flex gap-3 animate-slide-up">
                    <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center">
                      <Bot className="w-4 h-4 text-primary-foreground" />
                    </div>
                    <Card className="glass">
                      <CardContent className="p-3">
                        <div className="flex items-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span className="text-sm text-muted-foreground">
                            {isGeneratingImage ? '画像を生成中...' : '考え中...'}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                )}
              </div>
            </ScrollArea>

            {/* Quick Actions */}
            {messages.length > 0 && !isLoading && !isGeneratingImage && (
              <div className="px-4 py-2 border-t border-border">
                <div className="max-w-3xl mx-auto flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => generateImage(messages[messages.length - 1]?.content || '')}
                    disabled={messages.length === 0}
                  >
                    <ImageIcon className="w-4 h-4 mr-1" />
                    サムネイル生成
                  </Button>
                </div>
              </div>
            )}

            {/* Input */}
            <div className="p-4 border-t border-border bg-background/50">
              <div className="max-w-3xl mx-auto flex gap-2">
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="サムネイルのアイデアを相談..."
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                  disabled={isLoading || isGeneratingImage}
                  className="bg-secondary/50"
                />
                <Button
                  onClick={sendMessage}
                  disabled={!input.trim() || isLoading || isGeneratingImage}
                  className="gradient-primary glow-sm"
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-4 animate-fade-in">
              <div className="w-20 h-20 rounded-2xl gradient-primary mx-auto flex items-center justify-center glow">
                <Sparkles className="w-10 h-10 text-primary-foreground" />
              </div>
              <div>
                <h2 className="text-2xl font-bold">AIチャット</h2>
                <p className="text-muted-foreground mt-2">
                  サムネイルのアイデアをAIに相談しましょう
                </p>
              </div>
              <Button onClick={createNewConversation} className="gradient-primary glow-sm">
                <Plus className="w-4 h-4 mr-2" />
                チャットを始める
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
