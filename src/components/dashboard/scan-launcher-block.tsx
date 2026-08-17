import { useState } from 'react';
import { ChevronDownIcon, ChevronRightIcon, XIcon } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { formatSaveConfirmation, type SavedScan, type Suite } from '@/lib/api';

const saveHistoryOpenKey = 'ada-scanner:save-history-open';

function readSaveHistoryOpen() {
    try {
        return window.localStorage.getItem(saveHistoryOpenKey) !== '0';
    } catch {
        return true;
    }
}

function writeSaveHistoryOpen(open: boolean) {
    try {
        window.localStorage.setItem(saveHistoryOpenKey, open ? '1' : '0');
    } catch {
        // Keep the collapsed state for this session.
    }
}

type ScanLauncherBlockProps = {
    suites: Suite[];
    suiteId: string;
    busy: boolean;
    disabled: boolean;
    status: string;
    statusKind: '' | 'error';
    saveHistory: SavedScan[];
    onSuiteChange: (id: string) => void;
    onRun: () => void;
    onStop: () => void;
    onDismissSave: (id: number) => void;
};

export function ScanLauncherBlock({
    suites,
    suiteId,
    busy,
    disabled,
    status,
    statusKind,
    saveHistory,
    onSuiteChange,
    onRun,
    onStop,
    onDismissSave,
}: ScanLauncherBlockProps) {
    const [historyOpen, setHistoryOpen] = useState(readSaveHistoryOpen);

    function toggleHistory() {
        const next = !historyOpen;
        setHistoryOpen(next);
        writeSaveHistoryOpen(next);
    }

    return (
        <Card id="launch-form">
            <CardHeader>
                <CardTitle>Site test</CardTitle>
                <CardDescription>
                    Pick a site from config/sites.json, then run it. Stop scan kills Playwright now. Silent scans are cleared automatically after 60 seconds.
                </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
                <div className="grid gap-2">
                    <Label htmlFor="suite">Suite</Label>
                    <Select
                        value={suiteId || null}
                        onValueChange={(value) => onSuiteChange(value ?? '')}
                        disabled={busy || disabled}
                    >
                        <SelectTrigger id="suite" className="w-full" aria-label="Site test">
                            <SelectValue placeholder="Select a suite" />
                        </SelectTrigger>
                        <SelectContent alignItemWithTrigger={false}>
                            {suites.map((suite) => (
                                <SelectItem key={suite.id} value={suite.id}>
                                    {suite.label || suite.script}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button
                        id="run"
                        type="button"
                        disabled={busy || disabled}
                        aria-busy={busy}
                        onClick={onRun}
                        className="px-4"
                    >
                        {busy ? 'Running…' : 'Run'}
                    </Button>
                    <Button
                        id="stop"
                        type="button"
                        variant="destructive"
                        disabled={!busy || disabled}
                        onClick={onStop}
                    >
                        Stop scan
                    </Button>
                </div>
                {status ? (
                    <Alert id="status" variant={statusKind === 'error' ? 'destructive' : 'default'}>
                        <AlertDescription>{status}</AlertDescription>
                    </Alert>
                ) : (
                    <p id="status" className="sr-only" role="status" aria-live="polite" />
                )}
                {saveHistory.length > 0 ? (
                    <div id="save-history" className="grid gap-2">
                        <div className="flex items-center gap-2">
                            <button
                                id="save-history-toggle"
                                type="button"
                                className="flex min-w-0 items-center gap-1 text-sm font-medium"
                                aria-expanded={historyOpen}
                                aria-controls="save-history-list"
                                onClick={toggleHistory}
                            >
                                {historyOpen ? <ChevronDownIcon className="size-4" /> : <ChevronRightIcon className="size-4" />}
                                Save history
                                <span className="font-normal text-muted-foreground">({saveHistory.length})</span>
                            </button>
                        </div>
                        {historyOpen ? (
                            <ul id="save-history-list" className="h-32 overflow-x-hidden overflow-y-scroll rounded-xl border border-border">
                                {saveHistory.map((scan) => (
                                    <li
                                        key={scan.id}
                                        className="flex items-start justify-between gap-2 border-b border-border px-2.5 py-2 even:bg-muted/50 last:border-b-0"
                                    >
                                        <p className="min-w-0 truncate text-sm text-muted-foreground">{formatSaveConfirmation(scan)}</p>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon-xs"
                                            aria-label={`Dismiss save ${formatSaveConfirmation(scan)}`}
                                            onClick={() => onDismissSave(scan.id)}
                                        >
                                            <XIcon />
                                        </Button>
                                    </li>
                                ))}
                            </ul>
                        ) : null}
                    </div>
                ) : null}
            </CardContent>
        </Card>
    );
}
