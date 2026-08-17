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
import type { Suite } from '@/lib/api';

type ScanLauncherBlockProps = {
    suites: Suite[];
    suiteId: string;
    busy: boolean;
    disabled: boolean;
    status: string;
    statusKind: '' | 'error';
    onSuiteChange: (id: string) => void;
    onRun: () => void;
    onStop: () => void;
};

export function ScanLauncherBlock({
    suites,
    suiteId,
    busy,
    disabled,
    status,
    statusKind,
    onSuiteChange,
    onRun,
    onStop,
}: ScanLauncherBlockProps) {
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
            </CardContent>
        </Card>
    );
}
