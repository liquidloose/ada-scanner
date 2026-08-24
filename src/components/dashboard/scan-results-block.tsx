import { DownloadIcon, ExternalLinkIcon, Trash2Icon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardAction,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';

type ScanResultsBlockProps = {
    available: boolean;
    src: string;
    busy?: boolean;
    downloadName?: string;
    onDelete: () => void;
};

export function ScanResultsBlock({
    available,
    src,
    busy = false,
    downloadName = 'playwright-report.html',
    onDelete,
}: ScanResultsBlockProps) {
    return (
        <Card id="report-panel" className="scroll-mt-24">
            <CardHeader>
                <CardTitle>Scan results</CardTitle>
                <CardDescription>The latest Playwright HTML report.</CardDescription>
                <CardAction className="flex flex-wrap gap-2">
                    <Button
                        nativeButton={false}
                        render={<a href="/report/" target="_blank" rel="noreferrer" />}
                        variant="outline"
                        size="sm"
                        disabled={!available}
                    >
                        <ExternalLinkIcon data-icon="inline-start" />
                        Open in a new tab
                    </Button>
                    <Button
                        id="report-download"
                        nativeButton={false}
                        render={
                            <a
                                href="/api/report/download"
                                download={downloadName}
                            />
                        }
                        variant="outline"
                        size="sm"
                        disabled={!available}
                    >
                        <DownloadIcon data-icon="inline-start" />
                        Download report
                    </Button>
                    <Button
                        id="report-delete"
                        type="button"
                        variant="destructive"
                        size="sm"
                        disabled={!available || busy}
                        onClick={onDelete}
                    >
                        <Trash2Icon data-icon="inline-start" />
                        Delete report
                    </Button>
                </CardAction>
            </CardHeader>
            <CardContent>
                {available ? (
                    <iframe
                        id="report-frame"
                        title="Playwright scan report"
                        src={src}
                        className="block h-[300px] max-h-[300px] w-full rounded-xl border border-border bg-card"
                    />
                ) : (
                    <div
                        id="report-empty"
                        className="flex h-[300px] max-h-[300px] items-center justify-center rounded-xl border border-border text-sm text-muted-foreground"
                    >
                        No HTML report yet.
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
