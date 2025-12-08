import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type ThemeColor = 'purple' | 'red' | 'blue' | 'green' | 'orange' | 'pink';

interface ThemeContextType {
  themeColor: ThemeColor;
  setThemeColor: (color: ThemeColor) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const themeColors: Record<ThemeColor, { primary: string; accent: string; ring: string; gradientFrom: string; gradientTo: string }> = {
  purple: {
    primary: '262 83% 58%',
    accent: '262 83% 58%',
    ring: '262 83% 58%',
    gradientFrom: '262 83% 58%',
    gradientTo: '221 83% 53%',
  },
  red: {
    primary: '0 72% 51%',
    accent: '0 72% 51%',
    ring: '0 72% 51%',
    gradientFrom: '0 72% 51%',
    gradientTo: '25 95% 53%',
  },
  blue: {
    primary: '217 91% 60%',
    accent: '217 91% 60%',
    ring: '217 91% 60%',
    gradientFrom: '217 91% 60%',
    gradientTo: '199 89% 48%',
  },
  green: {
    primary: '142 76% 36%',
    accent: '142 76% 36%',
    ring: '142 76% 36%',
    gradientFrom: '142 76% 36%',
    gradientTo: '166 72% 40%',
  },
  orange: {
    primary: '25 95% 53%',
    accent: '25 95% 53%',
    ring: '25 95% 53%',
    gradientFrom: '25 95% 53%',
    gradientTo: '38 92% 50%',
  },
  pink: {
    primary: '330 81% 60%',
    accent: '330 81% 60%',
    ring: '330 81% 60%',
    gradientFrom: '330 81% 60%',
    gradientTo: '280 87% 65%',
  },
};

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeColor, setThemeColorState] = useState<ThemeColor>(() => {
    const saved = localStorage.getItem('theme-color');
    return (saved as ThemeColor) || 'purple';
  });

  const setThemeColor = (color: ThemeColor) => {
    setThemeColorState(color);
    localStorage.setItem('theme-color', color);
  };

  useEffect(() => {
    const colors = themeColors[themeColor];
    const root = document.documentElement;
    
    root.style.setProperty('--primary', colors.primary);
    root.style.setProperty('--accent', colors.accent);
    root.style.setProperty('--ring', colors.ring);
    root.style.setProperty('--gradient-from', colors.gradientFrom);
    root.style.setProperty('--gradient-to', colors.gradientTo);
    root.style.setProperty('--sidebar-primary', colors.primary);
    root.style.setProperty('--sidebar-ring', colors.ring);
  }, [themeColor]);

  return (
    <ThemeContext.Provider value={{ themeColor, setThemeColor }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

export const themeColorOptions: { value: ThemeColor; label: string; colorClass: string }[] = [
  { value: 'purple', label: 'パープル', colorClass: 'bg-[hsl(262,83%,58%)]' },
  { value: 'red', label: 'レッド', colorClass: 'bg-[hsl(0,72%,51%)]' },
  { value: 'blue', label: 'ブルー', colorClass: 'bg-[hsl(217,91%,60%)]' },
  { value: 'green', label: 'グリーン', colorClass: 'bg-[hsl(142,76%,36%)]' },
  { value: 'orange', label: 'オレンジ', colorClass: 'bg-[hsl(25,95%,53%)]' },
  { value: 'pink', label: 'ピンク', colorClass: 'bg-[hsl(330,81%,60%)]' },
];
