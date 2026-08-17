import { useEffect, useRef, useState } from 'react';
import { CheckIcon, CopyIcon, Trash2Icon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardAction,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';

type ScanOutputBlockProps = {
    output: string;
    onClear: () => void;
};

export function ScanOutputBlock({ output, onClear }: ScanOutputBlockProps) {
    const preRef = useRef<HTMLPreElement>(null);
    const [copied, setCopied] = useState(false);
    const hasOutput = output.length > 0;

    useEffect(() => {
        const node = preRef.current;
        if (node) {
            node.scrollTop = node.scrollHeight;
        }
    }, [output]);

    useEffect(() => {
        if (!copied) {
            return;
        }
        const timer = window.setTimeout(() => setCopied(false), 1500);
        return () => window.clearTimeout(timer);
    }, [copied]);

    async function copyOutput() {
        if (!hasOutput) {
            return;
        }
        try {
            await navigator.clipboard.writeText(output);
            setCopied(true);
        } catch {
            // Keep the existing output if the clipboard is unavailable.
        }
    }

    return (
        <Card id="output-panel">
            <CardHeader>
                <CardTitle>Scan output</CardTitle>
                <CardDescription>Live Playwright output. It stays after the suite finishes.</CardDescription>
                <CardAction className="flex flex-wrap gap-2">
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={!hasOutput}
                        onClick={copyOutput}
                    >
                        {copied ? <CheckIcon data-icon="inline-start" /> : <CopyIcon data-icon="inline-start" />}
                        {copied ? 'Copied' : 'Copy'}
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={!hasOutput}
                        onClick={onClear}
                    >
                        <Trash2Icon data-icon="inline-start" />
                        Clear
                    </Button>
                </CardAction>
            </CardHeader>
            <CardContent>
                <pre
                    id="output"
                    ref={preRef}
                    tabIndex={0}
                    className="h-[600px] overflow-auto rounded-lg bg-black p-4 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap text-[#f4efe4]"
                >
                    {output}
                </pre>
            </CardContent>
        </Card>
    );
}
