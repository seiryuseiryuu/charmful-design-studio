import { useState, useEffect } from 'react';
import { useTheme, themeColorOptions } from '@/hooks/useTheme';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { Check, Palette, Moon, Sun } from 'lucide-react';

export default function Settings() {
  const { themeColor, setThemeColor } = useTheme();
  
  const [isDarkMode, setIsDarkMode] = useState(() => {
    return document.documentElement.classList.contains('dark');
  });

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme-mode', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme-mode', 'light');
    }
  }, [isDarkMode]);

  useEffect(() => {
    const savedMode = localStorage.getItem('theme-mode');
    if (savedMode === 'light') {
      setIsDarkMode(false);
    } else {
      setIsDarkMode(true);
    }
  }, []);

  return (
    <div className="container max-w-4xl py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">設定</h1>
        <p className="text-muted-foreground mt-1">アプリの外観を管理</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Dark Mode Toggle */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              {isDarkMode ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
              テーマモード
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sun className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm">ライト</span>
              </div>
              <Switch
                checked={isDarkMode}
                onCheckedChange={setIsDarkMode}
              />
              <div className="flex items-center gap-2">
                <span className="text-sm">ダーク</span>
                <Moon className="w-4 h-4 text-muted-foreground" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Color Theme */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Palette className="w-5 h-5" />
              カラーテーマ
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-6 gap-2">
              {themeColorOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setThemeColor(option.value)}
                  className={cn(
                    'flex flex-col items-center gap-1 p-2 rounded-lg border-2 transition-all',
                    themeColor === option.value
                      ? 'border-primary bg-primary/10'
                      : 'border-transparent hover:border-border'
                  )}
                >
                  <div
                    className={cn(
                      'w-8 h-8 rounded-full flex items-center justify-center',
                      option.colorClass
                    )}
                  >
                    {themeColor === option.value && (
                      <Check className="w-4 h-4 text-white" />
                    )}
                  </div>
                  <Label className="text-[10px] cursor-pointer">{option.label}</Label>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
