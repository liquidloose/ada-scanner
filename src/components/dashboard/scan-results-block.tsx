import { Button, buttonVariants } from '@/components/ui/button';
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
};

export function ScanResultsBlock({ available, src }: ScanResultsBlockProps) {
    if (!available) {
        return null;
    }

    return (
        <Card id="report-panel">
            <CardHeader>
                <CardTitle>Scan results</CardTitle>
                <CardDescription>The latest Playwright HTML report.</CardDescription>
                <CardAction className="flex flex-wrap gap-2">
                    <a
                        className={buttonVariants({ variant: 'outline', size: 'sm' })}
                        href="/report/"
                        target="_blank"
                        rel="noreferrer"
                    >
                        Open in a new tab
                    </a>
                    <Button
                        id="report-download"
                        nativeButton={false}
                        render={
                            <a
                                href="/api/report/download"
                                download="playwright-report.html"
                            />
                        }
                        size="sm"
                    >
                        Download report
                    </Button>
                </CardAction>
            </CardHeader>
            <CardContent>
                <iframe
                    id="report-frame"
                    title="Playwright scan report"
                    src={src}
                    className="block h-[600px] w-full rounded-lg bg-white ring-1 ring-foreground/10"
                />
            </CardContent>
        </Card>
    );
}
