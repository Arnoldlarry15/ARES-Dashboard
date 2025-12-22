// Theme Manager for ARES Dashboard
// Handles dark/light theme switching and persistence

export type Theme = 'dark' | 'light';

const THEME_KEY = 'ares_dashboard_theme';

export class ThemeManager {
  static getTheme(): Theme {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === 'light' || stored === 'dark') {
      return stored;
    }
    
    // Default to dark theme
    return 'dark';
  }

  static setTheme(theme: Theme): void {
    localStorage.setItem(THEME_KEY, theme);
    document.documentElement.setAttribute('data-theme', theme);
  }

  static toggleTheme(): Theme {
    const current = this.getTheme();
    const newTheme: Theme = current === 'dark' ? 'light' : 'dark';
    this.setTheme(newTheme);
    return newTheme;
  }

  static initializeTheme(): void {
    const theme = this.getTheme();
    document.documentElement.setAttribute('data-theme', theme);
  }
}

// Color palette for themes
export const themeColors = {
  dark: {
    background: '#0a0f1e',
    surface: 'rgba(15, 23, 42, 0.8)',
    primary: '#10b981',
    secondary: '#3b82f6',
    accent: '#8b5cf6',
    text: '#ffffff',
    textSecondary: '#94a3b8',
    border: 'rgba(255, 255, 255, 0.1)',
  },
  light: {
    background: '#f8fafc',
    surface: 'rgba(255, 255, 255, 0.9)',
    primary: '#059669',
    secondary: '#2563eb',
    accent: '#7c3aed',
    text: '#0f172a',
    textSecondary: '#64748b',
    border: 'rgba(0, 0, 0, 0.1)',
  }
};
