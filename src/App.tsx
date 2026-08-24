import { useEffect, useRef, useState } from 'react';
import { AgentAccessBlock } from '@/components/dashboard/agent-access-block';
import { SitesBlock } from '@/components/dashboard/sites-block';
import { ScanLauncherBlock } from '@/components/dashboard/scan-launcher-block';
import { ScanOutputBlock } from '@/components/dashboard/scan-output-block';
import { ScanResultsBlock } from '@/components/dashboard/scan-results-block';
import { AllureReportsBlock } from '@/components/dashboard/allure-reports-block';
import { SpreadsheetsBlock } from '@/components/dashboard/spreadsheets-block';
import { ScanActionsBlock } from '@/components/dashboard/scan-actions-block';
import { SavedScansBlock } from '@/components/dashboard/saved-scans-block';
import { BackToTop } from '@/components/dashboard/back-to-top';
import { SiteNav, siteNavItems, type SiteNavItem } from '@/components/dashboard/site-nav';
import { ThemeToggle } from '@/components/dashboard/theme-toggle';
import { downloadBlob, filenameFromDisposition, formatSavedAt, formatSize, withSiteAddress, type AllureReport, type SavedScan, type ScannerTool, type Site, type SpreadsheetFile, type Suite } from '@/lib/api';
import { CheckCircle2Icon, Trash2Icon, XIcon } from 'lucide-react';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogMedia,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';

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

const saveHistoryKey = 'ada-scanner:save-history';

function isSavedScan(value: unknown): value is SavedScan {
    if (!value || typeof value !== 'object') {
        return false;
    }
    const scan = value as SavedScan;
    return (
        typeof scan.id === 'number' &&
        typeof scan.createdAt === 'string' &&
        typeof scan.fileCount === 'number' &&
        typeof scan.size === 'number'
    );
}

function readSaveHistory(): SavedScan[] {
    try {
        const raw = window.localStorage.getItem(saveHistoryKey);
        if (!raw) {
            return [];
        }
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter(isSavedScan) : [];
    } catch {
        return [];
    }
}

function writeSaveHistory(scans: SavedScan[]) {
    try {
        window.localStorage.setItem(saveHistoryKey, JSON.stringify(scans));
    } catch {
        // Keep the list for this session.
    }
}

export default function App() {
    const [suites, setSuites] = useState<Suite[]>([]);
    const [suiteId, setSuiteId] = useState('');
    const [busy, setBusy] = useState(false);
    const [disabled, setDisabled] = useState(false);
    const [status, setStatus] = useState('');
    const [statusKind, setStatusKind] = useState<'' | 'error'>('');
    const [lastSaved, setLastSaved] = useState<SavedScan | null>(null);
    const [saveHistory, setSaveHistory] = useState<SavedScan[]>(readSaveHistory);
    const [output, setOutput] = useState('');
    const [reportAvailable, setReportAvailable] = useState(false);
    const [reportSrc, setReportSrc] = useState('about:blank');
    const [allureReports, setAllureReports] = useState<AllureReport[]>([]);
    const [allureResults, setAllureResults] = useState(false);
    const [selectedAllure, setSelectedAllure] = useState<string[]>([]);
    const [creatingAllure, setCreatingAllure] = useState(false);
    const [pendingDeleteAllure, setPendingDeleteAllure] = useState<string[] | null>(null);
    const [spreadsheets, setSpreadsheets] = useState<SpreadsheetFile[]>([]);
    const [selected, setSelected] = useState<string[]>([]);
    const [pendingDelete, setPendingDelete] = useState<string[] | null>(null);
    const [pendingDeleteReport, setPendingDeleteReport] = useState(false);
    const [pendingStartOver, setPendingStartOver] = useState(false);
    const [pendingDeleteSaved, setPendingDeleteSaved] = useState<number[] | null>(null);
    const [tab, setTab] = useState<'scanner' | 'saved'>('scanner');
    const [activeSection, setActiveSection] = useState('launch-form');
    const pendingSection = useRef<string | null>(null);
    const [savedScans, setSavedScans] = useState<SavedScan[]>([]);
    const [selectedSaved, setSelectedSaved] = useState<number[]>([]);
    const [saving, setSaving] = useState(false);
    const [origin, setOrigin] = useState('');
    const [tools, setTools] = useState<ScannerTool[]>([]);
    const [sites, setSites] = useState<Site[]>([]);
    const [addingSite, setAddingSite] = useState(false);
    const [reconningId, setReconningId] = useState<string | null>(null);
    const [deletingSlugs, setDeletingSlugs] = useState(false);
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

    async function loadSavedScans() {
        try {
            const response = await fetch('/api/saved-scans');
            if (!response.ok) {
                return;
            }
            const data = await response.json();
            const scans = Array.isArray(data.scans) ? (data.scans as SavedScan[]) : [];
            setSavedScans(scans);
            setSelectedSaved((current) => current.filter((id) => scans.some((scan) => scan.id === id)));
        } catch {
            // Keep the scanner usable even if saved scans cannot load.
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
            await Promise.all([loadSpreadsheets(), loadAllureReports()]);
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

    useEffect(() => {
        writeSaveHistory(saveHistory);
    }, [saveHistory]);

    function goToSection(item: SiteNavItem) {
        pendingSection.current = item.id;
        setActiveSection(item.id);
        history.replaceState(null, '', `#${item.id}`);
        if (tab !== item.tab) {
            setTab(item.tab);
            return;
        }
        document.getElementById(item.id)?.scrollIntoView({ behavior: 'smooth' });
        pendingSection.current = null;
    }

    useEffect(() => {
        const hash = window.location.hash.replace(/^#/, '');
        const item = siteNavItems.find((entry) => entry.id === hash);
        if (!item) {
            return;
        }
        setTab(item.tab);
        setActiveSection(item.id);
        pendingSection.current = item.id;
    }, []);

    useEffect(() => {
        const id = pendingSection.current;
        if (!id) {
            return;
        }
        pendingSection.current = null;
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
    }, [tab]);

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

    async function loadSiteCatalog() {
        try {
            const [suitesResponse, sitesResponse] = await Promise.all([fetch('/api/suites'), fetch('/api/sites')]);
            if (suitesResponse.ok) {
                const data = await suitesResponse.json();
                const listed = Array.isArray(data.suites) ? data.suites : [];
                setSuites(listed);
                setSuiteId((current) => current || listed[0]?.id || '');
            }
            if (sitesResponse.ok) {
                const data = await sitesResponse.json();
                setSites(Array.isArray(data.sites) ? (data.sites as Site[]) : []);
            }
        } catch {
            // Keep the launcher usable even if the catalog cannot load.
        }
    }

    async function addSite(input: { url: string; label: string }) {
        setAddingSite(true);
        try {
            const response = await fetch('/api/sites', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ url: input.url, label: input.label || undefined }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                showStatus(data.message ?? 'Could not add the site.', 'error');
                return;
            }
            await loadSiteCatalog();
            const site = data.site as Site | undefined;
            if (site?.id) {
                setSuiteId(site.id);
            }
            const count = site?.recon?.counts.urls ?? site?.slugs.length ?? 0;
            showStatus(
                site?.recon?.status === 'failed'
                    ? `Added ${site.label}, but site recon failed.`
                    : `Added ${site?.label ?? 'site'} with ${count} URLs.`
            );
        } catch {
            showStatus('Could not reach the dashboard server.', 'error');
        } finally {
            setAddingSite(false);
        }
    }

    async function reconSite(id: string) {
        setReconningId(id);
        try {
            const response = await fetch(`/api/sites/${encodeURIComponent(id)}/recon`, { method: 'POST' });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                showStatus(data.message ?? 'Site recon failed.', 'error');
                return;
            }
            await loadSiteCatalog();
            const site = data.site as Site | undefined;
            const count = site?.recon?.counts.urls ?? site?.slugs.length ?? 0;
            showStatus(
                site?.recon?.status === 'failed'
                    ? `Site recon failed for ${site.label}.`
                    : `Site recon found ${count} URLs for ${site?.label ?? id}.`
            );
        } catch {
            showStatus('Could not reach the dashboard server.', 'error');
        } finally {
            setReconningId(null);
        }
    }

    async function deleteSiteSlugs(id: string, slugs: string[]) {
        if (slugs.length === 0) {
            return;
        }
        setDeletingSlugs(true);
        try {
            const response = await fetch(`/api/sites/${encodeURIComponent(id)}/slugs/delete`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ slugs }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                showStatus(data.message ?? 'Could not delete slugs.', 'error');
                return;
            }
            await loadSiteCatalog();
            const count = Array.isArray(data.deleted) ? data.deleted.length : slugs.length;
            showStatus(`Removed ${count} page${count === 1 ? '' : 's'} from ${data.site?.label ?? id}.`);
        } catch {
            showStatus('Could not reach the dashboard server.', 'error');
        } finally {
            setDeletingSlugs(false);
        }
    }

    async function loadAllureReports() {
        try {
            const response = await fetch('/api/allure');
            if (!response.ok) {
                return;
            }
            const data = await response.json();
            const reports = Array.isArray(data.reports) ? (data.reports as AllureReport[]) : [];
            setAllureResults(Boolean(data.results));
            setAllureReports(reports);
            setSelectedAllure((current) => current.filter((id) => reports.some((report) => report.id === id)));
        } catch {
            // Keep the launcher usable even if Allure reports cannot load.
        }
    }

    useEffect(() => {
        let cancelled = false;
        setOrigin(window.location.origin);
        (async () => {
            try {
                await loadSiteCatalog();
                const catalog = await fetch('/api');
                if (catalog.ok) {
                    const index = await catalog.json();
                    if (!cancelled && Array.isArray(index.tools)) {
                        setTools(index.tools as ScannerTool[]);
                    }
                }
                await Promise.all([loadReportLink(), loadSpreadsheets(), loadSavedScans(), loadAllureReports()]);
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
        setLastSaved(null);
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

    async function createAllureReport() {
        setCreatingAllure(true);
        try {
            const response = await fetch('/api/allure', { method: 'POST' });
            const data = await response.json();
            if (!response.ok) {
                showStatus(data.message ?? 'Could not create the Allure report.', 'error');
                return;
            }
            await loadAllureReports();
            if (data.report?.id) {
                setSelectedAllure([data.report.id]);
            }
            showStatus('Created an Allure report.');
        } catch {
            showStatus('Could not reach the dashboard server.', 'error');
        } finally {
            setCreatingAllure(false);
        }
    }

    async function confirmDeleteAllure() {
        const ids = pendingDeleteAllure ?? [];
        setPendingDeleteAllure(null);
        if (ids.length === 0) {
            return;
        }
        for (const id of ids) {
            const response = await fetch(`/api/allure/${encodeURIComponent(id)}`, { method: 'DELETE' });
            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                showStatus(data.message ?? 'Could not delete that Allure report.', 'error');
                return;
            }
        }
        setSelectedAllure((current) => current.filter((id) => !ids.includes(id)));
        await loadAllureReports();
        showStatus(ids.length === 1 ? 'Deleted the Allure report.' : `Deleted ${ids.length} Allure reports.`);
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

    async function confirmStartOver() {
        setPendingStartOver(false);
        await clearOutput();
        setSelected([]);

        const names = spreadsheets.map((file) => file.name);
        if (names.length > 0) {
            const sheets = await fetch('/api/spreadsheets/delete', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ names }),
            });
            if (!sheets.ok) {
                const data = await sheets.json().catch(() => ({}));
                showStatus(data.message ?? 'Could not delete the spreadsheets.', 'error');
                return;
            }
        }
        await loadSpreadsheets();

        const report = await fetch('/api/report', { method: 'DELETE' });
        if (!report.ok && report.status !== 404) {
            const data = await report.json().catch(() => ({}));
            showStatus(data.message ?? 'Could not delete the HTML report.', 'error');
            return;
        }
        setReport(false);
        setLastSaved(null);
        showStatus('Cleared the console, spreadsheets, and HTML report. Run a new scan to get data back.');
    }

    async function saveScanToDb() {
        if (!reportAvailable && spreadsheets.length === 0) {
            showStatus('Nothing to save. Run a scan first, or keep the current report and spreadsheets.', 'error');
            return;
        }
        setSaving(true);
        try {
            const response = await fetch('/api/saved-scans', { method: 'POST' });
            const data = await response.json();
            if (!response.ok) {
                showStatus(data.message ?? 'Could not save the scan.', 'error');
                return;
            }
            await loadSavedScans();
            const scan = data.scan as SavedScan | undefined;
            if (scan) {
                setLastSaved(scan);
                setSaveHistory((current) => [scan, ...current]);
            }
        } catch {
            showStatus('Could not reach the dashboard server.', 'error');
        } finally {
            setSaving(false);
        }
    }

    async function downloadSelectedSaved() {
        if (selectedSaved.length === 0) {
            return;
        }
        const response = await fetch('/api/saved-scans/download', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ ids: selectedSaved }),
        });
        if (!response.ok) {
            showStatus('Could not download the selected scans.', 'error');
            return;
        }
        downloadBlob(
            await response.blob(),
            filenameFromDisposition(
                response.headers.get('content-disposition'),
                selectedSaved.length === 1 ? 'scan.zip' : 'saved-scans.zip'
            )
        );
    }

    async function confirmDeleteSaved() {
        const ids = pendingDeleteSaved ?? [];
        setPendingDeleteSaved(null);
        if (ids.length === 0) {
            return;
        }
        const response =
            ids.length === 1
                ? await fetch(`/api/saved-scans/${ids[0]}`, { method: 'DELETE' })
                : await fetch('/api/saved-scans/delete', {
                      method: 'POST',
                      headers: { 'content-type': 'application/json' },
                      body: JSON.stringify({ ids }),
                  });
        if (!response.ok) {
            showStatus(
                ids.length === 1 ? 'Could not delete that saved scan.' : 'Could not delete the selected saved scans.',
                'error'
            );
            return;
        }
        await loadSavedScans();
    }

    const deleteLabel =
        pendingDelete?.length === 1 ? pendingDelete[0] : `${pendingDelete?.length ?? 0} spreadsheet files`;
    const savedDeleteLabel =
        pendingDeleteSaved?.length === 1
            ? `saved scan ${pendingDeleteSaved[0]}`
            : `${pendingDeleteSaved?.length ?? 0} saved scans`;
    const allureDeleteLabel =
        pendingDeleteAllure?.length === 1 ? 'this Allure report' : `${pendingDeleteAllure?.length ?? 0} Allure reports`;

    return (
        <div className="min-h-svh bg-background">
            <BackToTop />
            <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
                <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-5 py-3">
                    <p className="font-heading text-sm tracking-[0.18em] text-primary uppercase">river's edge</p>
                    <div className="min-w-0 flex-1">
                        <SiteNav activeId={activeSection} onNavigate={goToSection} />
                    </div>
                    <ThemeToggle />
                </div>
            </header>
            <main className="mx-auto flex max-w-6xl flex-col gap-8 px-5 py-10">
                <header className="space-y-3">
                    <div
                        className="flex flex-wrap items-end gap-x-8 border-b border-border"
                        role="tablist"
                        aria-label="Dashboard views"
                    >
                        <button
                            id="tab-scanner"
                            type="button"
                            role="tab"
                            aria-selected={tab === 'scanner'}
                            aria-controls="panel-scanner"
                            className={`-mb-px cursor-pointer border-b-2 pb-2 font-heading text-3xl font-bold tracking-tight ${
                                tab === 'scanner'
                                    ? 'border-primary text-foreground'
                                    : 'border-transparent text-muted-foreground hover:text-foreground'
                            }`}
                            onClick={() => {
                                setTab('scanner');
                                setActiveSection('launch-form');
                            }}
                        >
                            ADA Scanner
                        </button>
                        <button
                            id="tab-saved"
                            type="button"
                            role="tab"
                            aria-selected={tab === 'saved'}
                            aria-controls="panel-saved"
                            className={`-mb-px cursor-pointer border-b-2 pb-2 font-heading text-3xl font-bold tracking-tight ${
                                tab === 'saved'
                                    ? 'border-primary text-foreground'
                                    : 'border-transparent text-muted-foreground hover:text-foreground'
                            }`}
                            onClick={() => {
                                setTab('saved');
                                setActiveSection('saved-scans-panel');
                            }}
                        >
                            Saved Scans
                        </button>
                    </div>
                    {tab === 'scanner' ? (
                        <p className="max-w-2xl text-muted-foreground">
                            Run a site suite, watch the scan, then download the HTML report and spreadsheets. Agents get
                            the same actions over MCP.
                        </p>
                    ) : (
                        <p className="max-w-2xl text-muted-foreground">
                            Open a timestamped scan from the database, then download or delete it.
                        </p>
                    )}
                </header>
                {tab === 'scanner' ? (
                    <div id="panel-scanner" role="tabpanel" aria-labelledby="tab-scanner" className="flex w-full min-w-0 flex-col gap-8">
                <SitesBlock
                    sites={sites}
                    busy={busy}
                    adding={addingSite}
                    reconningId={reconningId}
                    deletingSlugs={deletingSlugs}
                    onAdd={addSite}
                    onRecon={reconSite}
                    onDeleteSlugs={deleteSiteSlugs}
                />
                <div className="grid gap-6 lg:grid-cols-2">
                    <ScanLauncherBlock
                        suites={suites}
                        suiteId={suiteId}
                        busy={busy}
                        disabled={disabled}
                        status={status}
                        statusKind={statusKind}
                        saveHistory={saveHistory}
                        onSuiteChange={setSuiteId}
                        onRun={runSuite}
                        onStop={stopScan}
                        onDismissSave={(id) => setSaveHistory((current) => current.filter((scan) => scan.id !== id))}
                    />
                    <AgentAccessBlock origin={origin} tools={tools} />
                </div>
                <ScanOutputBlock output={output} onClear={clearOutput} />
                <ScanResultsBlock
                    available={reportAvailable}
                    src={reportSrc}
                    busy={busy}
                    downloadName={withSiteAddress(
                        suites.find((suite) => suite.id === suiteId)?.baseURL,
                        'playwright-report.html'
                    )}
                    onDelete={() => setPendingDeleteReport(true)}
                />
                <AllureReportsBlock
                    reports={allureReports}
                    results={allureResults}
                    selected={selectedAllure}
                    busy={busy}
                    creating={creatingAllure}
                    onCreate={createAllureReport}
                    onToggle={(id, checked) => {
                        setSelectedAllure((current) =>
                            checked ? [...current, id] : current.filter((entry) => entry !== id)
                        );
                    }}
                    onToggleAll={(checked) => {
                        setSelectedAllure(checked ? allureReports.map((report) => report.id) : []);
                    }}
                    onDeleteSelected={() => setPendingDeleteAllure(selectedAllure)}
                    onDeleteOne={(id) => setPendingDeleteAllure([id])}
                />
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
                <ScanActionsBlock
                    disabled={busy || disabled}
                    canSave={reportAvailable || spreadsheets.length > 0}
                    saving={saving}
                    onSave={saveScanToDb}
                    onStartOver={() => setPendingStartOver(true)}
                />
                    </div>
                ) : (
                    <div id="panel-saved" role="tabpanel" aria-labelledby="tab-saved" className="w-full min-w-0">
                    <SavedScansBlock
                        scans={savedScans}
                        selected={selectedSaved}
                        busy={busy}
                        onToggle={(id, checked) => {
                            setSelectedSaved((current) =>
                                checked ? [...current, id] : current.filter((entry) => entry !== id)
                            );
                        }}
                        onToggleAll={(checked) => {
                            setSelectedSaved(checked ? savedScans.map((scan) => scan.id) : []);
                        }}
                        onDownloadSelected={downloadSelectedSaved}
                        onDeleteSelected={() => setPendingDeleteSaved(selectedSaved)}
                        onDeleteOne={(id) => setPendingDeleteSaved([id])}
                    />
                    </div>
                )}
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
                            <Trash2Icon data-icon="inline-start" />
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
            <AlertDialog open={pendingDeleteAllure != null} onOpenChange={(open) => !open && setPendingDeleteAllure(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete {allureDeleteLabel}?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This removes the generated Allure report
                            {pendingDeleteAllure && pendingDeleteAllure.length > 1 ? 's' : ''}. You cannot undo this.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction variant="destructive" onClick={confirmDeleteAllure}>
                            <Trash2Icon data-icon="inline-start" />
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
            <AlertDialog open={pendingStartOver} onOpenChange={(open) => !open && setPendingStartOver(false)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete everything and start over?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This clears the console and deletes all spreadsheets and the HTML report. You will need to
                            start a new scan to get the data back.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction variant="destructive" onClick={confirmStartOver}>
                            <Trash2Icon data-icon="inline-start" />
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
            <AlertDialog open={pendingDeleteSaved != null} onOpenChange={(open) => !open && setPendingDeleteSaved(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete {savedDeleteLabel}?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This removes the saved scan{pendingDeleteSaved && pendingDeleteSaved.length > 1 ? 's' : ''}{' '}
                            from the database. You cannot undo this.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction variant="destructive" onClick={confirmDeleteSaved}>
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
            <AlertDialog open={lastSaved != null} onOpenChange={(open) => !open && setLastSaved(null)}>
                <AlertDialogContent id="save-scan-confirm" className="max-w-md sm:max-w-md">
                    <AlertDialogCancel
                        id="save-scan-confirm-dismiss"
                        variant="ghost"
                        size="icon-xs"
                        aria-label="Dismiss saved confirmation"
                        className="absolute top-3 right-3 text-muted-foreground hover:text-foreground"
                    >
                        <XIcon />
                    </AlertDialogCancel>
                    <AlertDialogHeader>
                        <AlertDialogMedia className="bg-[color-mix(in_srgb,var(--card)_70%,var(--primary)_30%)] text-primary">
                            <CheckCircle2Icon />
                        </AlertDialogMedia>
                        <AlertDialogTitle>Saved to the database</AlertDialogTitle>
                        <AlertDialogDescription>
                            {lastSaved
                                ? `${lastSaved.siteUrl || lastSaved.suiteId || 'Scan'} is stored and ready to download from Saved scans.`
                                : 'The scan is stored and ready to download from Saved scans.'}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    {lastSaved ? (
                        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                            <dt className="text-muted-foreground">Saved at</dt>
                            <dd className="font-medium">{formatSavedAt(lastSaved.createdAt)}</dd>
                            <dt className="text-muted-foreground">Site</dt>
                            <dd className="min-w-0 truncate font-medium" title={lastSaved.siteUrl || lastSaved.suiteId || undefined}>
                                {lastSaved.siteUrl || lastSaved.suiteId || '—'}
                            </dd>
                            <dt className="text-muted-foreground">Files</dt>
                            <dd className="font-medium">{lastSaved.fileCount}</dd>
                            <dt className="text-muted-foreground">Size</dt>
                            <dd className="font-medium">{formatSize(lastSaved.size)}</dd>
                        </dl>
                    ) : null}
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
