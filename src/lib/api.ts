export type Suite = {
    id: string;
    label: string;
    script: string;
    baseURL?: string;
};

export type SiteRecon = {
    ranAt: string;
    status: 'ok' | 'failed';
    error: string | null;
    sitemapFiles: string[];
    counts: {
        sitemapFiles: number;
        sitemapLinks: number;
        homepageLinks: number;
        urls: number;
    };
    slugs: string[];
};

export type Site = {
    id: string;
    label: string;
    baseURL: string;
    slugs: Array<string | { path: string; sheet?: string }>;
    waitUntil?: string;
    cacheBust?: boolean;
    recon: SiteRecon | null;
};

export type SpreadsheetFile = {
    name: string;
    size: number;
    mtime: string;
    href: string;
};

export type SavedScan = {
    id: number;
    createdAt: string;
    suiteId: string | null;
    siteUrl: string | null;
    fileCount: number;
    size: number;
    href: string;
};

export type AllureReport = {
    id: string;
    createdAt: string;
    suiteId: string | null;
    siteUrl: string | null;
    size: number;
    href: string;
};

export type ScannerTool = {
    name: string;
    title: string;
    description: string;
};

export type RunEvent =
    | { type: 'start'; id: string }
    | { type: 'log'; text: string }
    | { type: 'done'; ok: boolean; id: string; code: number; busy: boolean; report: boolean };

export function formatSize(bytes: number) {
    if (bytes < 1024) {
        return `${bytes} B`;
    }
    if (bytes < 1024 * 1024) {
        return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatSavedAt(iso: string) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
        return iso;
    }
    return date.toLocaleString();
}

export function formatSaveConfirmation(scan: Pick<SavedScan, 'createdAt' | 'suiteId' | 'siteUrl' | 'fileCount' | 'size'>) {
    const where = scan.siteUrl || scan.suiteId || 'unknown site';
    const files = `${scan.fileCount} file${scan.fileCount === 1 ? '' : 's'}`;
    return `${where} · ${formatSavedAt(scan.createdAt)} · ${files} · ${formatSize(scan.size)}`;
}

export function filenameFromDisposition(header: string | null, fallback: string) {
    const match = /filename="([^"]+)"/.exec(header ?? '');
    return match?.[1] || fallback;
}

export function isCombinedSpreadsheet(name: string) {
    return /(^|_)(master-list|work-list)\.xlsx$/i.test(name);
}

export function slugKey(slug: string | { path: string }) {
    const raw = typeof slug === 'string' ? slug : slug.path;
    return raw.replace(/^\/+|\/+$/g, '');
}

export function slugLabel(slug: string | { path: string; sheet?: string }) {
    const key = slugKey(slug);
    if (!key) {
        return 'home (/)';
    }
    const sheet = typeof slug === 'object' && slug.sheet ? ` · ${slug.sheet}` : '';
    return `/${key}${sheet}`;
}

export function withSiteAddress(baseURL: string | null | undefined, name: string) {
    if (!baseURL || !name) {
        return name;
    }
    let host = '';
    try {
        host = new URL(baseURL).host;
    } catch {
        host = String(baseURL).replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
    }
    host = host.replace(/[^a-zA-Z0-9.-]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase();
    if (!host || name === host || name.startsWith(`${host}_`)) {
        return name;
    }
    return `${host}_${name}`;
}

export function downloadBlob(blob: Blob, filename: string) {
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
}

export async function readNdjson(response: Response, onEvent: (event: RunEvent) => void) {
    const reader = response.body?.getReader();
    if (!reader) {
        throw new Error('No response body');
    }
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
        const { value, done } = await reader.read();
        if (done) {
            break;
        }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
            if (line.trim()) {
                onEvent(JSON.parse(line) as RunEvent);
            }
        }
    }
    if (buffer.trim()) {
        onEvent(JSON.parse(buffer) as RunEvent);
    }
}
