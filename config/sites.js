import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

export const defaultSitesPath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    'sites.json'
);

const slugSchema = z.union([
    z.string(),
    z.object({
        path: z.string(),
        sheet: z.string().min(1).optional(),
    }),
]);

const siteSchema = z.object({
    id: z.string().min(1),
    label: z.string().min(1).optional(),
    baseURL: z.string().url(),
    slugs: z.array(slugSchema).min(1),
    cacheBust: z.boolean().optional(),
    waitUntil: z.enum(['load', 'domcontentloaded', 'networkidle', 'commit']).optional(),
    axe: z
        .object({
            tags: z.array(z.string()).optional(),
            exclude: z.array(z.string()).optional(),
            disableRules: z.array(z.string()).optional(),
        })
        .optional(),
});

const fileSchema = z.object({
    sites: z.array(siteSchema).min(1),
});

export function loadSites(sitesPath = process.env.ADA_SITES_FILE || defaultSitesPath) {
    const parsed = fileSchema.parse(JSON.parse(readFileSync(sitesPath, 'utf8')));
    const ids = new Set();
    for (const site of parsed.sites) {
        if (ids.has(site.id)) {
            throw new Error(`Duplicate site id: ${site.id}`);
        }
        ids.add(site.id);
    }
    return parsed.sites;
}

export function getSite(id, sitesPath) {
    if (!id) {
        throw new Error('SITE_ID is required');
    }
    const site = loadSites(sitesPath).find((entry) => entry.id === id);
    if (!site) {
        throw new Error(`Unknown SITE_ID: ${id}`);
    }
    return site;
}

export function slugPath(slug) {
    return typeof slug === 'string' ? slug : slug.path;
}

export function pageUrl(baseURL, slug) {
    const base = String(baseURL).replace(/\/+$/, '');
    const segment = slugPath(slug).replace(/^\/+/, '');
    return segment ? `${base}/${segment}` : base;
}

export function sheetName(slug) {
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

export function siteUrl(baseURL) {
    if (baseURL == null || baseURL === '') {
        return null;
    }
    try {
        return new URL(baseURL).origin;
    } catch {
        const raw = String(baseURL).replace(/\/+$/, '');
        return raw || null;
    }
}

export function siteAddress(baseURL) {
    if (baseURL == null || baseURL === '') {
        return '';
    }
    let host = String(baseURL);
    try {
        host = new URL(baseURL).host;
    } catch {
        host = String(baseURL).replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
    }
    return host.replace(/[^a-zA-Z0-9.-]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase() || 'site';
}

export function withSiteAddress(baseURL, name) {
    const host = siteAddress(baseURL);
    if (!host || !name) {
        return name;
    }
    if (name === host || name.startsWith(`${host}_`)) {
        return name;
    }
    return `${host}_${name}`;
}

export function sheetFileName(baseURL, slug) {
    return withSiteAddress(baseURL, sheetName(slug));
}
