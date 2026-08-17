import { readFileSync } from 'node:fs';
import path from 'node:path';

export type SiteSlug = string | { path: string; sheet?: string };

export type Site = {
    id: string;
    label?: string;
    baseURL: string;
    slugs: SiteSlug[];
    cacheBust?: boolean;
    waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' | 'commit';
    axe?: {
        tags?: string[];
        exclude?: string[];
        disableRules?: string[];
    };
};

export function loadSites(
    sitesPath = process.env.ADA_SITES_FILE || path.join(process.cwd(), 'config', 'sites.json')
): Site[] {
    const parsed = JSON.parse(readFileSync(sitesPath, 'utf8')) as { sites?: Site[] };
    if (!Array.isArray(parsed.sites) || parsed.sites.length === 0) {
        throw new Error('config/sites.json must have a sites array');
    }
    return parsed.sites;
}

export function getSite(id: string | undefined, sitesPath?: string): Site {
    if (!id) {
        throw new Error('SITE_ID is required');
    }
    const site = loadSites(sitesPath).find((entry) => entry.id === id);
    if (!site) {
        throw new Error(`Unknown SITE_ID: ${id}`);
    }
    return site;
}

export function slugPath(slug: SiteSlug) {
    return typeof slug === 'string' ? slug : slug.path;
}

export function pageUrl(baseURL: string, slug: SiteSlug) {
    const base = String(baseURL).replace(/\/+$/, '');
    const segment = slugPath(slug).replace(/^\/+/, '');
    return segment ? `${base}/${segment}` : base;
}

export function sheetName(slug: SiteSlug) {
    if (typeof slug === 'object' && slug.sheet) {
        return slug.sheet;
    }
    const raw = slugPath(slug);
    if (!raw) {
        return 'home';
    }
    const safe = raw.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '');
    return safe || 'home';
}
