import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { 
  ImageIcon, 
  Settings, 
  TrendingUp,
  Clock,
  ArrowRight,
  Plus,
  Users,
  Palette,
  Wand2
} from 'lucide-react';

interface Stats {
  totalThumbnails: number;
  totalChannels: number;
  totalAssets: number;
}

interface RecentThumbnail {
  id: string;
  image_url: string;
  title: string | null;
  created_at: string;
}

interface ChannelAsset {
  id: string;
  name: string;
  asset_type: string;
  image_url: string;
}

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats>({ totalThumbnails: 0, totalChannels: 0, totalAssets: 0 });
  const [recentThumbnails, setRecentThumbnails] = useState<RecentThumbnail[]>([]);
  const [channelAssets, setChannelAssets] = useState<ChannelAsset[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      if (!user) return;

      const [thumbnailsRes, channelsRes, assetsRes, recentRes, assetsDataRes] = await Promise.all([
        supabase.from('thumbnails').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
        supabase.from('channel_settings').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
        supabase.from('channel_assets').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
        supabase.from('thumbnails').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(4),
        supabase.from('channel_assets').select('id, name, asset_type, image_url').eq('user_id', user.id).limit(6),
      ]);

      setStats({
        totalThumbnails: thumbnailsRes.count || 0,
        totalChannels: channelsRes.count || 0,
        totalAssets: assetsRes.count || 0,
      });

      setRecentThumbnails(recentRes.data || []);
      setChannelAssets(assetsDataRes.data || []);
      setLoading(false);
    }

    fetchData();
  }, [user]);

  const statCards = [
    { title: 'サムネイル', value: stats.totalThumbnails, icon: ImageIcon, color: 'from-violet-500 to-purple-600' },
    { title: 'チャンネル', value: stats.totalChannels, icon: Settings, color: 'from-emerald-500 to-teal-600' },
    { title: '登録素材', value: stats.totalAssets, icon: Users, color: 'from-orange-500 to-rose-600' },
  ];

  const quickActions = [
    { title: 'サムネイル作成', description: 'AIでサムネイルを作成', icon: Wand2, href: '/create', color: 'primary' },
    { title: 'ギャラリー', description: '作成したサムネイル一覧', icon: ImageIcon, href: '/gallery', color: 'secondary' },
    { title: 'チャンネル設定', description: 'チャンネル情報を管理', icon: Settings, href: '/channels', color: 'secondary' },
    { title: '素材管理', description: '人物・キャラクター素材', icon: Palette, href: '/settings', color: 'secondary' },
  ];

  const assetTypeLabels: Record<string, string> = {
    self: '自分',
    member: 'メンバー',
    character: 'キャラクター',
    channel_icon: 'アイコン',
    other: 'その他',
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8 animate-fade-in">
      {/* Welcome Section */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">
          おかえりなさい{user?.user_metadata?.display_name ? `、${user.user_metadata.display_name}` : ''}
        </h1>
        <p className="text-muted-foreground">
          AIを活用してYouTubeサムネイルを作成しましょう
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statCards.map((stat, index) => (
          <Card key={stat.title} className="glass glass-hover animate-slide-up" style={{ animationDelay: `${index * 100}ms` }}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{stat.title}</p>
                  <p className="text-3xl font-bold mt-1">{loading ? '-' : stat.value}</p>
                </div>
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${stat.color} flex items-center justify-center`}>
                  <stat.icon className="w-6 h-6 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-primary" />
          クイックアクション
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {quickActions.map((action, index) => (
            <Link key={action.title} to={action.href}>
              <Card className="glass glass-hover group cursor-pointer animate-slide-up h-full" style={{ animationDelay: `${(index + 4) * 100}ms` }}>
                <CardContent className="p-6 flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-xl ${action.color === 'primary' ? 'gradient-primary glow-sm' : 'bg-secondary'} flex items-center justify-center shrink-0`}>
                    <action.icon className={`w-6 h-6 ${action.color === 'primary' ? 'text-primary-foreground' : 'text-foreground'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium">{action.title}</h3>
                    <p className="text-sm text-muted-foreground">{action.description}</p>
                  </div>
                  <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-foreground group-hover:translate-x-1 transition-all" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      {/* Channel Assets */}
      {channelAssets.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              登録素材
            </h2>
            <Link to="/settings">
              <Button variant="ghost" size="sm">
                管理する
                <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
          </div>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
            {channelAssets.map((asset, index) => (
              <Card key={asset.id} className="glass glass-hover overflow-hidden animate-slide-up" style={{ animationDelay: `${(index + 8) * 50}ms` }}>
                <div className="aspect-square relative bg-secondary">
                  <img
                    src={asset.image_url}
                    alt={asset.name}
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                </div>
                <CardContent className="p-2 text-center">
                  <p className="text-xs font-medium truncate">{asset.name}</p>
                  <p className="text-xs text-muted-foreground">{assetTypeLabels[asset.asset_type] || asset.asset_type}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Recent Thumbnails */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary" />
            最近のサムネイル
          </h2>
          {recentThumbnails.length > 0 && (
            <Link to="/gallery">
              <Button variant="ghost" size="sm">
                すべて見る
                <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
          )}
        </div>

        {recentThumbnails.length === 0 && !loading ? (
          <Card className="glass">
            <CardContent className="p-12 text-center">
              <div className="w-16 h-16 rounded-2xl bg-secondary mx-auto flex items-center justify-center mb-4">
                <ImageIcon className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="font-medium mb-2">サムネイルがありません</h3>
              <p className="text-sm text-muted-foreground mb-4">
                ワークフローでサムネイルを作成してみましょう
              </p>
              <Link to="/create">
                <Button className="gradient-primary glow-sm">
                  <Plus className="w-4 h-4 mr-2" />
                  サムネイルを作成
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {recentThumbnails.map((thumbnail, index) => (
              <Card key={thumbnail.id} className="glass glass-hover overflow-hidden animate-slide-up" style={{ animationDelay: `${(index + 8) * 100}ms` }}>
                <div className="aspect-video relative bg-secondary">
                  <img
                    src={thumbnail.image_url}
                    alt={thumbnail.title || 'Thumbnail'}
                    className="absolute inset-0 w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                </div>
                <CardContent className="p-3">
                  <p className="text-sm font-medium truncate">{thumbnail.title || '無題'}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(thumbnail.created_at).toLocaleDateString('ja-JP')}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
