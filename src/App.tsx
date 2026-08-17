import { useEffect, useState } from 'react';
import { ScanLauncherBlock } from '@/components/dashboard/scan-launcher-block';
import { ScanOutputBlock } from '@/components/dashboard/scan-output-block';
import { ScanResultsBlock } from '@/components/dashboard/scan-results-block';
import { SpreadsheetsBlock } from '@/components/dashboard/spreadsheets-block';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
    downloadBlob,
    filenameFromDisposition,
    type SpreadsheetFile,
    type Suite,
} from '@/lib/api';

export default function App() {
    const [suites, setSuites] = useState<Suite[]>([]);
    const [suiteId, setSuiteId] = useState('');
    const [busy, setBusy] = useState(false);
    const [disabled, setDisabled] = useState(false);
    const [status, setStatus] = useState('');
    const [statusKind, setStatusKind] = useState<'' | 'error'>('');
    const [output, setOutput] = useState('');
    const [reportAvailable, setReportAvailable] = useState(false);
    const [reportSrc, setReportSrc] = useState('about:blank');
    const [spreadsheets, setSpreadsheets] = useState<SpreadsheetFile[]>([]);
    const [selected, setSelected] = useState<string[]>([]);
    const [pendingDelete, setPendingDelete] = useState<string[] | null>(null);

    function showStatus(message: string, kind: '' | 'error' = '') {
        setStatus(message);
        setStatusKind(kind);
    }

    function setReport(available: boolean) {
        setReportAvailable(available);
        setReportSrc(available ? `/report/?t=${Date.now()}` : 'about:blank');
    }

    async function loadSpreadsheets() {
        try {
            const response = await fetch('/api/spreadsheets');
            if (!response.ok) {
                return;
            }
            const data = await response.json();
            const files = Array.isArray(data.files) ? (data.files as SpreadsheetFile[]) : [];
            setSpreadsheets(files);
            setSelected((current) => current.filter((name) => files.some((file) => file.name === name)));
        } catch {
            // Keep the launcher usable even if the spreadsheet list cannot load.
        }
    }

    async function loadLastOutput() {
        try {
            const response = await fetch('/api/runs/current');
            if (!response.ok) {
                return;
            }
            const current = await response.json();
            if (typeof current.logs === 'string' && current.logs.length > 0) {
                setOutput(current.logs);
            }
        } catch {
            // Keep the empty pane if the last run cannot be loaded.
        }
    }

    async function loadReportLink() {
        try {
            const response = await fetch('/api/report');
            if (!response.ok) {
                return;
            }
            const data = await response.json();
            setReport(Boolean(data.available));
        } catch {
            // Keep the launcher usable even if the last report is missing.
        }
    }

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const response = await fetch('/api/suites');
                if (!response.ok) {
                    throw new Error('Could not load suites');
                }
                const data = await response.json();
                if (!cancelled) {
                    setSuites(Array.isArray(data.suites) ? data.suites : []);
                }
                await Promise.all([loadReportLink(), loadSpreadsheets(), loadLastOutput()]);
            } catch {
                if (!cancelled) {
                    showStatus('Could not load site tests from package.json.', 'error');
                    setDisabled(true);
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    async function runSuite() {
        if (!suiteId) {
            showStatus('Select a suite before running.', 'error');
            return;
        }

        setBusy(true);
        setOutput('');
        showStatus(`Running ${suiteId}…`);

        try {
            const response = await fetch('/api/runs', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ id: suiteId }),
            });
            const data = await response.json();
            if (response.status === 409 || data.reason === 'busy') {
                showStatus(data.message ?? 'A scan is already running.', 'error');
                return;
            }
            if (!response.ok || !data.ok) {
                showStatus(data.message ?? (data.reason === 'no-selection' ? 'Select a suite before running.' : 'Could not start that suite.'), 'error');
                return;
            }

            while (true) {
                const currentResponse = await fetch('/api/runs/current');
                if (!currentResponse.ok) {
                    showStatus('Could not read scan status.', 'error');
                    return;
                }
                const current = await currentResponse.json();
                setOutput(current.logs ?? '');
                if (current.status !== 'running') {
                    setReport(Boolean(current.report));
                    await loadSpreadsheets();
                    showStatus(`${suiteId} finished (exit ${current.code ?? 0}).`);
                    return;
                }
                await new Promise((resolve) => setTimeout(resolve, 300));
            }
        } catch {
            showStatus('Could not reach the dashboard server.', 'error');
        } finally {
            setBusy(false);
        }
    }

    async function downloadSelected() {
        if (selected.length === 0) {
            return;
        }
        const response = await fetch('/api/spreadsheets/download', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ names: selected }),
        });
        if (!response.ok) {
            showStatus('Could not download the selected spreadsheets.', 'error');
            return;
        }
        downloadBlob(
            await response.blob(),
            filenameFromDisposition(response.headers.get('content-disposition'), selected.length === 1 ? selected[0] : 'spreadsheets.zip')
        );
    }

    async function confirmDelete() {
        const names = pendingDelete ?? [];
        setPendingDelete(null);
        if (names.length === 0) {
            return;
        }
        const response =
            names.length === 1
                ? await fetch(`/api/spreadsheets/${encodeURIComponent(names[0])}`, { method: 'DELETE' })
                : await fetch('/api/spreadsheets/delete', {
                      method: 'POST',
                      headers: { 'content-type': 'application/json' },
                      body: JSON.stringify({ names }),
                  });
        if (!response.ok) {
            showStatus(
                names.length === 1 ? `Could not delete ${names[0]}.` : 'Could not delete the selected spreadsheets.',
                'error'
            );
            return;
        }
        await loadSpreadsheets();
    }

    const deleteLabel =
        pendingDelete?.length === 1 ? pendingDelete[0] : `${pendingDelete?.length ?? 0} spreadsheet files`;

    return (
        <div className="min-h-svh bg-background">
            <main className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-10">
                <header className="space-y-1">
                    <h1 className="font-heading text-3xl tracking-tight">ADA Scanner</h1>
                    <p className="text-muted-foreground">
                        Run a site suite, watch the scan, then download the HTML report and spreadsheets.
                    </p>
                </header>
                <ScanLauncherBlock
                    suites={suites}
                    suiteId={suiteId}
                    busy={busy}
                    disabled={disabled}
                    status={status}
                    statusKind={statusKind}
                    onSuiteChange={setSuiteId}
                    onRun={runSuite}
                />
                <SpreadsheetsBlock
                    files={spreadsheets}
                    selected={selected}
                    onToggle={(name, checked) => {
                        setSelected((current) =>
                            checked ? [...current, name] : current.filter((entry) => entry !== name)
                        );
                    }}
                    onToggleAll={(checked) => {
                        setSelected(checked ? spreadsheets.map((file) => file.name) : []);
                    }}
                    onDownloadSelected={downloadSelected}
                    onDeleteSelected={() => setPendingDelete(selected)}
                    onDeleteOne={(name) => setPendingDelete([name])}
                />
                <ScanOutputBlock output={output} onClear={() => setOutput('')} />
                <ScanResultsBlock available={reportAvailable} src={reportSrc} />
            </main>
            <AlertDialog open={pendingDelete != null} onOpenChange={(open) => !open && setPendingDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete {deleteLabel}?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This removes the file{pendingDelete && pendingDelete.length > 1 ? 's' : ''} from the
                            spreadsheets folder. You cannot undo this.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction variant="destructive" onClick={confirmDelete}>
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
