import { useEffect, useState } from 'react';
import { CheckIcon, CopyIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardAction,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import type { ScannerTool } from '@/lib/api';

type AgentAccessBlockProps = {
    origin: string;
    tools: ScannerTool[];
};

export function AgentAccessBlock({ origin, tools }: AgentAccessBlockProps) {
    const [copied, setCopied] = useState(false);
    const mcpUrl = origin ? `${origin}/mcp` : '/mcp';

    useEffect(() => {
        if (!copied) {
            return;
        }
        const timer = window.setTimeout(() => setCopied(false), 1500);
        return () => window.clearTimeout(timer);
    }, [copied]);

    async function copyUrl() {
        try {
            await navigator.clipboard.writeText(mcpUrl);
            setCopied(true);
        } catch {
            // Keep the URL visible if the clipboard is unavailable.
        }
    }

    return (
        <Card id="agent-access">
            <CardHeader>
                <CardTitle>Agent access</CardTitle>
                <CardDescription>
                    The same scan, report, and spreadsheet actions as this page, over MCP.
                </CardDescription>
                <CardAction>
                    <Button type="button" variant="outline" size="sm" onClick={copyUrl}>
                        {copied ? <CheckIcon data-icon="inline-start" /> : <CopyIcon data-icon="inline-start" />}
                        {copied ? 'Copied' : 'Copy URL'}
                    </Button>
                </CardAction>
            </CardHeader>
            <CardContent className="grid gap-3">
                <p className="font-mono text-sm break-all text-primary">{mcpUrl}</p>
                <p className="text-muted-foreground">
                    Point Cursor at this URL, or keep stdio <code className="font-mono">npm run dashboard:mcp</code> —
                    it attaches here when this page is running so both share one Playwright runner.
                </p>
                {tools.length > 0 ? (
                    <ul className="grid gap-1 text-sm">
                        {tools.map((tool) => (
                            <li key={tool.name}>
                                <span className="font-mono">{tool.name}</span>
                                <span className="text-muted-foreground"> — {tool.title}</span>
                            </li>
                        ))}
                    </ul>
                ) : null}
            </CardContent>
        </Card>
    );
}
