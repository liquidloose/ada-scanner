import { useState } from 'react';
import { MoonIcon, SunIcon } from 'lucide-react';
import { applyTheme, currentTheme, type Theme } from '@/lib/theme';

export function ThemeToggle() {
    const [theme, setTheme] = useState<Theme>(() =>
        typeof document === 'undefined' ? 'dark' : currentTheme()
    );

    function toggle() {
        const next = theme === 'dark' ? 'light' : 'dark';
        applyTheme(next);
        setTheme(next);
    }

    return (
        <button
            type="button"
            id="theme-toggle"
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-pressed={theme === 'dark'}
            onClick={toggle}
            className="inline-flex size-8 cursor-pointer items-center justify-center rounded-full border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
        >
            {theme === 'dark' ? <SunIcon className="size-4" /> : <MoonIcon className="size-4" />}
        </button>
    );
}
