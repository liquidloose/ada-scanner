import { spawn as defaultSpawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const uiDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const defaultReconScript = path.join(uiDir, 'recon', 'site_recon.py');
export const defaultPython = process.env.ADA_PYTHON || 'python3';

export function normalizeSiteUrl(raw) {
    const trimmed = String(raw ?? '').trim();
    if (!trimmed) {
        return null;
    }
    const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    try {
        const url = new URL(withScheme);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
            return null;
        }
        if (url.hostname !== 'localhost' && !url.hostname.includes('.')) {
            return null;
        }
        return url.origin;
    } catch {
        return null;
    }
}

export function siteIdFromUrl(baseURL, existingIds = []) {
    let host;
    try {
        host = new URL(baseURL).hostname.replace(/^www\./i, '');
    } catch {
        host = 'site';
    }
    const first = host.split('.')[0] || 'site';
    const base = first.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'site';
    const taken = new Set(existingIds);
    if (!taken.has(base)) {
        return base;
    }
    let n = 2;
    while (taken.has(`${base}-${n}`)) {
        n += 1;
    }
    return `${base}-${n}`;
}

export function labelFromUrl(baseURL) {
    try {
        return new URL(baseURL).hostname.replace(/^www\./i, '');
    } catch {
        return baseURL;
    }
}

export function urlToSlug(baseURL, pageUrl) {
    let base;
    let page;
    try {
        base = new URL(baseURL);
        page = new URL(pageUrl);
    } catch {
        return null;
    }
    const left = (page.hostname || '').replace(/^www\./i, '').toLowerCase();
    const right = (base.hostname || '').replace(/^www\./i, '').toLowerCase();
    if (left !== right) {
        return null;
    }
    if (page.protocol !== 'http:' && page.protocol !== 'https:') {
        return null;
    }
    const raw = page.pathname.replace(/\/+$/, '').replace(/^\/+/, '');
    return raw;
}

export function urlsToSlugs(baseURL, urls = []) {
    const seen = new Set();
    const slugs = [];
    for (const item of urls) {
        const slug = urlToSlug(baseURL, item);
        if (slug == null) {
            continue;
        }
        const key = slug.toLowerCase();
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        slugs.push(slug);
    }
    if (!seen.has('')) {
        slugs.unshift('');
    }
    return slugs.length > 0 ? slugs : [''];
}

export function summarizeRecon(raw, baseURL, now = new Date()) {
    const sitemapFiles = asStringList(raw?.sitemapFiles);
    const sitemapLinks = asStringList(raw?.sitemapLinks);
    const homepageLinks = asStringList(raw?.homepageLinks);
    const urls = asStringList(raw?.urls);
    const slugs = urlsToSlugs(baseURL, urls.length > 0 ? urls : [...sitemapLinks, ...homepageLinks]);
    return {
        ranAt: now.toISOString(),
        status: 'ok',
        error: null,
        sitemapFiles,
        sitemapLinks,
        homepageLinks,
        urls: urls.length > 0 ? urls : slugs.map((slug) => (slug ? `${String(baseURL).replace(/\/+$/, '')}/${slug}` : String(baseURL).replace(/\/+$/, ''))),
        slugs,
        counts: {
            sitemapFiles: sitemapFiles.length,
            sitemapLinks: sitemapLinks.length,
            homepageLinks: homepageLinks.length,
            urls: urls.length || slugs.length,
        },
    };
}

export function failedRecon(error, now = new Date()) {
    return {
        ranAt: now.toISOString(),
        status: 'failed',
        error: String(error ?? 'Site recon failed'),
        sitemapFiles: [],
        sitemapLinks: [],
        homepageLinks: [],
        urls: [],
        slugs: [''],
        counts: {
            sitemapFiles: 0,
            sitemapLinks: 0,
            homepageLinks: 0,
            urls: 0,
        },
    };
}

export async function runSiteRecon(
    baseURL,
    {
        spawn = defaultSpawn,
        python = defaultPython,
        script = defaultReconScript,
        cwd = uiDir,
    } = {}
) {
    const generated = await new Promise((resolve) => {
        const child = spawn(python, [script, baseURL], { cwd });
        let stdout = '';
        let stderr = '';
        child.stdout?.on('data', (chunk) => {
            stdout += chunk.toString();
        });
        child.stderr?.on('data', (chunk) => {
            stderr += chunk.toString();
        });
        child.once('error', (error) => resolve({ ok: false, error: error.message, stdout, stderr }));
        child.once('close', (code) => {
            resolve({ ok: code === 0, code, stdout, stderr });
        });
    });
    if (!generated.ok) {
        return { ok: false, reason: 'recon-failed', error: generated.error || generated.stderr.trim() || 'Site recon failed' };
    }
    let payload;
    try {
        payload = JSON.parse(lastJsonObject(generated.stdout));
    } catch {
        return { ok: false, reason: 'recon-failed', error: 'Site recon returned invalid JSON' };
    }
    if (payload?.ok === false || payload?.error) {
        return { ok: false, reason: 'recon-failed', error: payload.error || 'Site recon failed' };
    }
    return { ok: true, recon: summarizeRecon(payload, baseURL) };
}

function asStringList(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    return [...new Set(value.map((item) => String(item).trim()).filter(Boolean))];
}

function lastJsonObject(text) {
    const raw = String(text ?? '');
    const start = raw.lastIndexOf('\n{') >= 0 ? raw.lastIndexOf('\n{') + 1 : raw.indexOf('{');
    if (start < 0) {
        throw new SyntaxError('No JSON object');
    }
    return raw.slice(start).trim();
}
