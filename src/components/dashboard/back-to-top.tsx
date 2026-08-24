import { useEffect, useState } from 'react';
import { ArrowUpIcon } from 'lucide-react';

const showAfterPx = 300;

export function BackToTop() {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        function onScroll() {
            setVisible(window.scrollY > showAfterPx);
        }
        onScroll();
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    if (!visible) {
        return null;
    }

    return (
        <button
            type="button"
            id="back-to-top"
            aria-label="Back to top"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="fixed right-5 bottom-5 z-40 inline-flex size-10 cursor-pointer items-center justify-center rounded-full border border-border bg-card text-primary shadow-md hover:bg-muted"
        >
            <ArrowUpIcon className="size-4" />
        </button>
    );
}
