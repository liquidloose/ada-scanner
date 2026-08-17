import { DatabaseIcon, Trash2Icon } from 'lucide-react';
import { Button } from '@/components/ui/button';

type ScanActionsBlockProps = {
    disabled?: boolean;
    saving?: boolean;
    onSave: () => void;
    onStartOver: () => void;
};

const glassButton =
    'h-12 w-full rounded-xl border border-border text-base font-semibold backdrop-blur-sm active:opacity-70';

export function ScanActionsBlock({
    disabled = false,
    saving = false,
    onSave,
    onStartOver,
}: ScanActionsBlockProps) {
    return (
        <div className="grid grid-cols-2 gap-1.5">
            <Button
                id="save-scan"
                type="button"
                variant="ghost"
                disabled={disabled || saving}
                aria-busy={saving}
                onClick={onSave}
                className={`${glassButton} bg-[color-mix(in_srgb,var(--card)_82%,var(--primary)_18%)] text-primary hover:bg-[color-mix(in_srgb,var(--card)_70%,var(--primary)_30%)] hover:text-primary`}
            >
                <DatabaseIcon data-icon="inline-start" />
                {saving ? 'Saving…' : 'Save scan to db'}
            </Button>
            <Button
                id="start-over"
                type="button"
                variant="destructive"
                disabled={disabled}
                onClick={onStartOver}
                className={`${glassButton} bg-[color-mix(in_srgb,var(--card)_82%,var(--destructive)_18%)] hover:bg-[color-mix(in_srgb,var(--card)_70%,var(--destructive)_30%)]`}
            >
                <Trash2Icon data-icon="inline-start" />
                Start Over
            </Button>
        </div>
    );
}
