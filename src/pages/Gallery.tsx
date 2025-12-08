import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import {
  ImageIcon,
  Search,
  Download,
  Trash2,
  ExternalLink,
  Calendar,
  Loader2,
  Plus,
} from 'lucide-react';
import { Link } from 'react-router-dom';
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

interface Thumbnail {
  id: string;
  image_url: string;
  prompt: string | null;
  title: string | null;
  created_at: string;
}

export default function Gallery() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [thumbnails, setThumbnails] = useState<Thumbnail[]>([]);
  const [filteredThumbnails, setFilteredThumbnails] = useState<Thumbnail[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedThumbnail, setSelectedThumbnail] = useState<Thumbnail | null>(null);

  useEffect(() => {
    fetchThumbnails();
  }, [user]);

  useEffect(() => {
    if (searchQuery.trim()) {
      const filtered = thumbnails.filter(
        (t) =>
          t.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          t.prompt?.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredThumbnails(filtered);
    } else {
      setFilteredThumbnails(thumbnails);
    }
  }, [searchQuery, thumbnails]);

  const fetchThumbnails = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('thumbnails')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      toast({ title: 'エラー', description: '画像の読み込みに失敗しました', variant: 'destructive' });
    } else {
      setThumbnails(data || []);
      setFilteredThumbnails(data || []);
    }
    setLoading(false);
  };

  const deleteThumbnail = async (id: string) => {
    const { error } = await supabase.from('thumbnails').delete().eq('id', id);

    if (error) {
      toast({ title: 'エラー', description: '削除に失敗しました', variant: 'destructive' });
    } else {
      setThumbnails((prev) => prev.filter((t) => t.id !== id));
      setSelectedThumbnail(null);
      toast({ title: '削除完了', description: 'サムネイルを削除しました' });
    }
  };

  const downloadImage = async (url: string, filename: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename || 'thumbnail.png';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch {
      window.open(url, '_blank');
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold">ギャラリー</h1>
          <p className="text-muted-foreground">
            {thumbnails.length} 件のサムネイル
          </p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="検索..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-secondary/50"
            />
          </div>
          <Link to="/create">
            <Button className="gradient-primary glow-sm shrink-0">
              <Plus className="w-4 h-4 mr-2" />
              新規作成
            </Button>
          </Link>
        </div>
      </div>

      {/* Gallery Grid */}
      {filteredThumbnails.length === 0 ? (
        <Card className="glass">
          <CardContent className="p-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-secondary mx-auto flex items-center justify-center mb-4">
              <ImageIcon className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="font-medium mb-2">
              {searchQuery ? '検索結果がありません' : 'サムネイルがありません'}
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              {searchQuery ? '別のキーワードで検索してみてください' : 'AIチャットでサムネイルを作成しましょう'}
            </p>
            {!searchQuery && (
              <Link to="/create">
                <Button className="gradient-primary glow-sm">
                  <Plus className="w-4 h-4 mr-2" />
                  サムネイルを作成
                </Button>
              </Link>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredThumbnails.map((thumbnail, index) => (
            <Card
              key={thumbnail.id}
              className="glass glass-hover overflow-hidden cursor-pointer group animate-slide-up"
              style={{ animationDelay: `${index * 50}ms` }}
              onClick={() => setSelectedThumbnail(thumbnail)}
            >
              <div className="aspect-video relative bg-secondary overflow-hidden">
                <img
                  src={thumbnail.image_url}
                  alt={thumbnail.title || 'Thumbnail'}
                  className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="absolute bottom-2 right-2 flex gap-1">
                    <Button
                      size="icon"
                      variant="secondary"
                      className="w-8 h-8"
                      onClick={(e) => {
                        e.stopPropagation();
                        downloadImage(thumbnail.image_url, `${thumbnail.title || 'thumbnail'}.png`);
                      }}
                    >
                      <Download className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
              <CardContent className="p-3">
                <p className="font-medium truncate text-sm">{thumbnail.title || '無題'}</p>
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                  <Calendar className="w-3 h-3" />
                  {new Date(thumbnail.created_at).toLocaleDateString('ja-JP')}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Detail Dialog */}
      <Dialog open={!!selectedThumbnail} onOpenChange={() => setSelectedThumbnail(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{selectedThumbnail?.title || '無題'}</DialogTitle>
          </DialogHeader>
          {selectedThumbnail && (
            <div className="space-y-4">
              <div className="aspect-video relative bg-secondary rounded-lg overflow-hidden">
                <img
                  src={selectedThumbnail.image_url}
                  alt={selectedThumbnail.title || 'Thumbnail'}
                  className="absolute inset-0 w-full h-full object-contain"
                />
              </div>
              
              {selectedThumbnail.prompt && (
                <div className="p-4 bg-secondary/50 rounded-lg">
                  <p className="text-sm font-medium mb-1">プロンプト</p>
                  <p className="text-sm text-muted-foreground">{selectedThumbnail.prompt}</p>
                </div>
              )}

              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  作成日: {new Date(selectedThumbnail.created_at).toLocaleString('ja-JP')}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => window.open(selectedThumbnail.image_url, '_blank')}
                  >
                    <ExternalLink className="w-4 h-4 mr-2" />
                    開く
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() =>
                      downloadImage(
                        selectedThumbnail.image_url,
                        `${selectedThumbnail.title || 'thumbnail'}.png`
                      )
                    }
                  >
                    <Download className="w-4 h-4 mr-2" />
                    ダウンロード
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive">
                        <Trash2 className="w-4 h-4 mr-2" />
                        削除
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>サムネイルを削除しますか？</AlertDialogTitle>
                        <AlertDialogDescription>
                          この操作は取り消せません。
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>キャンセル</AlertDialogCancel>
                        <AlertDialogAction onClick={() => deleteThumbnail(selectedThumbnail.id)}>
                          削除
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
