import { useEffect, useState } from 'react';
import { AgentAccessBlock } from '@/components/dashboard/agent-access-block';
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
import { downloadBlob, filenameFromDisposition, type ScannerTool, type SpreadsheetFile, type Suite } from '@/lib/api';

const clearedOutputKey = 'ada-scanner:cleared-output';

function runOutputKey(current: { id?: string | null; startedAt?: string | null }) {
    if (!current.id || !current.startedAt) {
        return null;
    }
    return `${current.id}:${current.startedAt}`;
}

function readClearedOutputKey() {
    try {
        return window.localStorage.getItem(clearedOutputKey);
    } catch {
        return null;
    }
}

function isOutputCleared(current: { id?: string | null; startedAt?: string | null }) {
    const key = runOutputKey(current);
    return Boolean(key) && readClearedOutputKey() === key;
}

function markOutputCleared(current: { id?: string | null; startedAt?: string | null }) {
    const key = runOutputKey(current);
    if (!key) {
        return;
    }
    try {
        window.localStorage.setItem(clearedOutputKey, key);
    } catch {
        // Keep the pane empty even if persistence is unavailable.
    }
}

function forgetClearedOutput() {
    try {
        window.localStorage.removeItem(clearedOutputKey);
    } catch {
        // The next scan can still write live output.
    }
}

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
    const [pendingDeleteReport, setPendingDeleteReport] = useState(false);
    const [origin, setOrigin] = useState('');
    const [tools, setTools] = useState<ScannerTool[]>([]);
    const [combining, setCombining] = useState(false);

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

    async function applyRunSnapshot(current: {
        id?: string | null;
        logs?: string;
        report?: boolean;
        stopped?: boolean;
        hung?: boolean;
        status?: string;
        code?: number | null;
        startedAt?: string | null;
    }) {
        if (!isOutputCleared(current)) {
            setOutput(typeof current.logs === 'string' ? current.logs : '');
        }
        if (current.status !== 'running') {
            setReport(Boolean(current.report));
            await loadSpreadsheets();
            if (current.hung) {
                showStatus('Stopped a hung scan (no Playwright output).');
            } else if (current.stopped) {
                showStatus('Stopped the running scan.');
            } else if (current.status === 'finished') {
                showStatus(`${current.id ?? suiteId} finished (exit ${current.code ?? 0}).`);
            }
        }
    }

    async function watchRun() {
        while (true) {
            const currentResponse = await fetch('/api/runs/current');
            if (!currentResponse.ok) {
                showStatus('Could not read scan status.', 'error');
                return;
            }
            const current = await currentResponse.json();
            await applyRunSnapshot(current);
            if (current.status !== 'running') {
                return;
            }
            await new Promise((resolve) => setTimeout(resolve, 300));
        }
    }

    async function loadLastOutput() {
        try {
            const response = await fetch('/api/runs/current');
            if (!response.ok) {
                return false;
            }
            const current = await response.json();
            if (current.status === 'running') {
                if (current.id) {
                    setSuiteId(current.id);
                }
                setBusy(true);
                showStatus(`Running ${current.id ?? 'scan'}…`);
                if (!isOutputCleared(current)) {
                    setOutput(typeof current.logs === 'string' ? current.logs : '');
                }
                return true;
            }
            if (isOutputCleared(current)) {
                return false;
            }
            if (typeof current.logs === 'string' && current.logs.length > 0) {
                setOutput(current.logs);
            }
            return false;
        } catch {
            return false;
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
        setOrigin(window.location.origin);
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
                const catalog = await fetch('/api');
                if (catalog.ok) {
                    const index = await catalog.json();
                    if (!cancelled && Array.isArray(index.tools)) {
                        setTools(index.tools as ScannerTool[]);
                    }
                }
                await Promise.all([loadReportLink(), loadSpreadsheets()]);
                const running = await loadLastOutput();
                if (!cancelled && running) {
                    try {
                        await watchRun();
                    } finally {
                        if (!cancelled) {
                            setBusy(false);
                        }
                    }
                }
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
        forgetClearedOutput();
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
                showStatus('A scan is already running. Stop it if it is hung.');
                await watchRun();
                return;
            }
            if (!response.ok || !data.ok) {
                showStatus(data.message ?? (data.reason === 'no-selection' ? 'Select a suite before running.' : 'Could not start that suite.'), 'error');
                return;
            }

            await watchRun();
        } catch {
            showStatus('Could not reach the dashboard server.', 'error');
        } finally {
            setBusy(false);
        }
    }

    async function stopScan() {
        showStatus('Stopping scan…');
        try {
            const response = await fetch('/api/runs/current/stop', { method: 'POST' });
            const data = await response.json();
            if (!response.ok) {
                showStatus(data.message ?? 'Could not stop the scan.', 'error');
                return;
            }
            await applyRunSnapshot(data);
            if (!data.stopped && data.status !== 'finished') {
                showStatus('No scan was running.');
            }
        } catch {
            showStatus('Could not reach the dashboard server.', 'error');
        } finally {
            setBusy(false);
        }
    }

    async function clearOutput() {
        setOutput('');
        try {
            const response = await fetch('/api/runs/current');
            if (!response.ok) {
                return;
            }
            markOutputCleared(await response.json());
        } catch {
            // Keep the pane empty even if the last run cannot be tagged.
        }
    }

    async function combineSpreadsheets() {
        setCombining(true);
        try {
            const response = await fetch('/api/spreadsheets/combine', { method: 'POST' });
            const data = await response.json();
            if (!response.ok) {
                showStatus(data.message ?? 'Could not combine spreadsheets.', 'error');
                return;
            }
            await loadSpreadsheets();
            showStatus(
                `Wrote ${data.master.name} (${data.master.rows} rows) and ${data.work.name} (${data.work.rows} unique).`
            );
        } catch {
            showStatus('Could not reach the dashboard server.', 'error');
        } finally {
            setCombining(false);
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

    async function confirmDeleteReport() {
        setPendingDeleteReport(false);
        const response = await fetch('/api/report', { method: 'DELETE' });
        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            showStatus(data.message ?? 'Could not delete the HTML report.', 'error');
            return;
        }
        setReport(false);
        showStatus('Deleted the HTML report.');
    }

    const deleteLabel =
        pendingDelete?.length === 1 ? pendingDelete[0] : `${pendingDelete?.length ?? 0} spreadsheet files`;

    return (
        <div className="min-h-svh bg-background">
            <main className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-10">
                <header className="space-y-1">
                    <h1 className="font-heading text-3xl tracking-tight">ADA Scanner</h1>
                    <p className="text-muted-foreground">
                        Run a site suite, watch the scan, then download the HTML report and spreadsheets. Agents get
                        the same actions over MCP.
                    </p>
                </header>
                <div className="grid gap-6 lg:grid-cols-2">
                    <ScanLauncherBlock
                        suites={suites}
                        suiteId={suiteId}
                        busy={busy}
                        disabled={disabled}
                        status={status}
                        statusKind={statusKind}
                        onSuiteChange={setSuiteId}
                        onRun={runSuite}
                        onStop={stopScan}
                    />
                    <AgentAccessBlock origin={origin} tools={tools} />
                </div>
                <SpreadsheetsBlock
                    files={spreadsheets}
                    selected={selected}
                    busy={busy}
                    combining={combining}
                    onToggle={(name, checked) => {
                        setSelected((current) =>
                            checked ? [...current, name] : current.filter((entry) => entry !== name)
                        );
                    }}
                    onToggleAll={(checked) => {
                        setSelected(checked ? spreadsheets.map((file) => file.name) : []);
                    }}
                    onCombine={combineSpreadsheets}
                    onDownloadSelected={downloadSelected}
                    onDeleteSelected={() => setPendingDelete(selected)}
                    onDeleteOne={(name) => setPendingDelete([name])}
                />
                <ScanOutputBlock output={output} onClear={clearOutput} />
                <ScanResultsBlock
                    available={reportAvailable}
                    src={reportSrc}
                    busy={busy}
                    onDelete={() => setPendingDeleteReport(true)}
                />
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
            <AlertDialog open={pendingDeleteReport} onOpenChange={(open) => !open && setPendingDeleteReport(false)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete the HTML report?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This removes the Playwright report from playwright-report. You cannot undo this.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction variant="destructive" onClick={confirmDeleteReport}>
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
