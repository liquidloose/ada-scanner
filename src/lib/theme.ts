export type Theme = 'light' | 'dark';

export const themeStorageKey = 'ada-scanner:theme';

export function readTheme(): Theme {
    try {
        const stored = window.localStorage.getItem(themeStorageKey);
        if (stored === 'light' || stored === 'dark') {
            return stored;
        }
    } catch {
        // Fall through to the system preference.
    }
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function applyTheme(theme: Theme) {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.style.colorScheme = theme;
    document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', theme);
    try {
        window.localStorage.setItem(themeStorageKey, theme);
    } catch {
        // Theme still applies for this session.
    }
}

export function currentTheme(): Theme {
    return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}
