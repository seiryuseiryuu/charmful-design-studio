import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import {
  Plus,
  Youtube,
  Users,
  Edit2,
  Trash2,
  Loader2,
  Link as LinkIcon,
  Palette,
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

interface Channel {
  id: string;
  channel_name: string;
  channel_url: string | null;
  channel_type: 'own' | 'competitor';
  theme_color: string | null;
  description: string | null;
  created_at: string;
}

interface ChannelFormData {
  channel_name: string;
  channel_url: string;
  theme_color: string;
  description: string;
}

const defaultFormData: ChannelFormData = {
  channel_name: '',
  channel_url: '',
  theme_color: '#8b5cf6',
  description: '',
};

export default function Channels() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingChannel, setEditingChannel] = useState<Channel | null>(null);
  const [formData, setFormData] = useState<ChannelFormData>(defaultFormData);
  const [channelType, setChannelType] = useState<'own' | 'competitor'>('own');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchChannels();
  }, [user]);

  const fetchChannels = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('channel_settings')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      toast({ title: 'エラー', description: 'チャンネルの読み込みに失敗しました', variant: 'destructive' });
    } else {
      setChannels((data || []) as Channel[]);
    }
    setLoading(false);
  };

  const openCreateDialog = (type: 'own' | 'competitor') => {
    setChannelType(type);
    setEditingChannel(null);
    setFormData(defaultFormData);
    setIsDialogOpen(true);
  };

  const openEditDialog = (channel: Channel) => {
    setEditingChannel(channel);
    setChannelType(channel.channel_type);
    setFormData({
      channel_name: channel.channel_name,
      channel_url: channel.channel_url || '',
      theme_color: channel.theme_color || '#8b5cf6',
      description: channel.description || '',
    });
    setIsDialogOpen(true);
  };

  const saveChannel = async () => {
    if (!user || !formData.channel_name.trim()) {
      toast({ title: 'エラー', description: 'チャンネル名を入力してください', variant: 'destructive' });
      return;
    }

    setIsSaving(true);

    const channelData = {
      channel_name: formData.channel_name,
      channel_url: formData.channel_url || null,
      channel_type: channelType,
      theme_color: formData.theme_color || null,
      description: formData.description || null,
    };

    if (editingChannel) {
      const { error } = await supabase
        .from('channel_settings')
        .update(channelData)
        .eq('id', editingChannel.id);

      if (error) {
        toast({ title: 'エラー', description: '更新に失敗しました', variant: 'destructive' });
      } else {
        toast({ title: '更新完了', description: 'チャンネル情報を更新しました' });
        fetchChannels();
        setIsDialogOpen(false);
      }
    } else {
      const { error } = await supabase
        .from('channel_settings')
        .insert({ ...channelData, user_id: user.id });

      if (error) {
        toast({ title: 'エラー', description: '保存に失敗しました', variant: 'destructive' });
      } else {
        toast({ title: '保存完了', description: 'チャンネルを追加しました' });
        fetchChannels();
        setIsDialogOpen(false);
      }
    }

    setIsSaving(false);
  };

  const deleteChannel = async (id: string) => {
    const { error } = await supabase.from('channel_settings').delete().eq('id', id);

    if (error) {
      toast({ title: 'エラー', description: '削除に失敗しました', variant: 'destructive' });
    } else {
      setChannels((prev) => prev.filter((c) => c.id !== id));
      toast({ title: '削除完了', description: 'チャンネルを削除しました' });
    }
  };

  const ownChannels = channels.filter((c) => c.channel_type === 'own');
  const competitorChannels = channels.filter((c) => c.channel_type === 'competitor');

  const ChannelCard = ({ channel }: { channel: Channel }) => (
    <Card className="glass glass-hover animate-slide-up">
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
            style={{ backgroundColor: channel.theme_color || '#8b5cf6' }}
          >
            <Youtube className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-medium truncate">{channel.channel_name}</h3>
            {channel.channel_url && (
              <a
                href={channel.channel_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline flex items-center gap-1 mt-1"
              >
                <LinkIcon className="w-3 h-3" />
                チャンネルを見る
              </a>
            )}
            {channel.description && (
              <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{channel.description}</p>
            )}
          </div>
          <div className="flex gap-1">
            <Button size="icon" variant="ghost" onClick={() => openEditDialog(channel)}>
              <Edit2 className="w-4 h-4" />
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="icon" variant="ghost">
                  <Trash2 className="w-4 h-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>チャンネルを削除しますか？</AlertDialogTitle>
                  <AlertDialogDescription>
                    この操作は取り消せません。
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>キャンセル</AlertDialogCancel>
                  <AlertDialogAction onClick={() => deleteChannel(channel.id)}>
                    削除
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const EmptyState = ({ type }: { type: 'own' | 'competitor' }) => (
    <Card className="glass">
      <CardContent className="p-8 text-center">
        <div className="w-12 h-12 rounded-xl bg-secondary mx-auto flex items-center justify-center mb-3">
          {type === 'own' ? <Youtube className="w-6 h-6 text-muted-foreground" /> : <Users className="w-6 h-6 text-muted-foreground" />}
        </div>
        <h3 className="font-medium mb-1">
          {type === 'own' ? '自分のチャンネルを登録' : '競合チャンネルを追加'}
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          {type === 'own'
            ? 'チャンネル情報を登録してサムネイル生成に活用'
            : '競合を分析してより良いサムネイルを作成'}
        </p>
        <Button onClick={() => openCreateDialog(type)} className="gradient-primary glow-sm">
          <Plus className="w-4 h-4 mr-2" />
          追加する
        </Button>
      </CardContent>
    </Card>
  );

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold">チャンネル設定</h1>
        <p className="text-muted-foreground">
          自分のチャンネルと競合を管理
        </p>
      </div>

      <Tabs defaultValue="own" className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-6">
          <TabsTrigger value="own" className="flex items-center gap-2">
            <Youtube className="w-4 h-4" />
            自分のチャンネル ({ownChannels.length})
          </TabsTrigger>
          <TabsTrigger value="competitor" className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            競合チャンネル ({competitorChannels.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="own" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => openCreateDialog('own')} className="gradient-primary glow-sm">
              <Plus className="w-4 h-4 mr-2" />
              チャンネルを追加
            </Button>
          </div>
          {ownChannels.length === 0 ? (
            <EmptyState type="own" />
          ) : (
            <div className="grid gap-4">
              {ownChannels.map((channel) => (
                <ChannelCard key={channel.id} channel={channel} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="competitor" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => openCreateDialog('competitor')} className="gradient-primary glow-sm">
              <Plus className="w-4 h-4 mr-2" />
              競合を追加
            </Button>
          </div>
          {competitorChannels.length === 0 ? (
            <EmptyState type="competitor" />
          ) : (
            <div className="grid gap-4">
              {competitorChannels.map((channel) => (
                <ChannelCard key={channel.id} channel={channel} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingChannel
                ? 'チャンネルを編集'
                : channelType === 'own'
                ? '自分のチャンネルを追加'
                : '競合チャンネルを追加'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="channel_name">チャンネル名 *</Label>
              <Input
                id="channel_name"
                value={formData.channel_name}
                onChange={(e) => setFormData({ ...formData, channel_name: e.target.value })}
                placeholder="例: My Channel"
                className="bg-secondary/50"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="channel_url">チャンネルURL</Label>
              <Input
                id="channel_url"
                value={formData.channel_url}
                onChange={(e) => setFormData({ ...formData, channel_url: e.target.value })}
                placeholder="https://youtube.com/@..."
                className="bg-secondary/50"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="theme_color" className="flex items-center gap-2">
                <Palette className="w-4 h-4" />
                テーマカラー
              </Label>
              <div className="flex gap-2">
                <Input
                  id="theme_color"
                  type="color"
                  value={formData.theme_color}
                  onChange={(e) => setFormData({ ...formData, theme_color: e.target.value })}
                  className="w-12 h-10 p-1 cursor-pointer"
                />
                <Input
                  value={formData.theme_color}
                  onChange={(e) => setFormData({ ...formData, theme_color: e.target.value })}
                  className="flex-1 bg-secondary/50"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">説明</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="チャンネルの特徴やスタイルなど..."
                className="bg-secondary/50 min-h-[100px]"
              />
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                キャンセル
              </Button>
              <Button onClick={saveChannel} disabled={isSaving} className="gradient-primary glow-sm">
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                {editingChannel ? '更新' : '追加'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
