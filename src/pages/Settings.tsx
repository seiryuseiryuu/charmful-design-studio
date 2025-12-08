import { useTheme, themeColorOptions, ThemeColor } from '@/hooks/useTheme';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { Check, Palette } from 'lucide-react';

export default function Settings() {
  const { themeColor, setThemeColor } = useTheme();

  return (
    <div className="container max-w-2xl py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">設定</h1>
        <p className="text-muted-foreground mt-1">アプリの外観をカスタマイズ</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="w-5 h-5" />
            カラーテーマ
          </CardTitle>
          <CardDescription>
            アプリ全体のアクセントカラーを選択してください
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
            {themeColorOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => setThemeColor(option.value)}
                className={cn(
                  'flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all duration-200',
                  themeColor === option.value
                    ? 'border-primary bg-primary/10'
                    : 'border-transparent hover:border-border hover:bg-muted/50'
                )}
              >
                <div
                  className={cn(
                    'w-10 h-10 rounded-full flex items-center justify-center',
                    option.colorClass
                  )}
                >
                  {themeColor === option.value && (
                    <Check className="w-5 h-5 text-white" />
                  )}
                </div>
                <Label className="text-xs font-medium cursor-pointer">
                  {option.label}
                </Label>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
