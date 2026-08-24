import { readFileSync, renameSync, writeFileSync } from 'node:fs';
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

export const defaultAxe = {
    tags: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'],
    exclude: [],
    disableRules: [],
};

const reconSchema = z.object({
    ranAt: z.string(),
    status: z.enum(['ok', 'failed']),
    error: z.string().nullable().optional(),
    sitemapFiles: z.array(z.string()).optional(),
    sitemapLinks: z.array(z.string()).optional(),
    homepageLinks: z.array(z.string()).optional(),
    urls: z.array(z.string()).optional(),
    slugs: z.array(z.string()).optional(),
    counts: z
        .object({
            sitemapFiles: z.number().optional(),
            sitemapLinks: z.number().optional(),
            homepageLinks: z.number().optional(),
            urls: z.number().optional(),
        })
        .optional(),
});

const siteSchema = z.object({
    id: z.string().min(1),
    label: z.string().min(1).optional(),
    baseURL: z.string().url(),
    slugs: z.array(slugSchema).min(1),
    recon: reconSchema.optional(),
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

export function writeSites(sites, sitesPath = process.env.ADA_SITES_FILE || defaultSitesPath) {
    const parsed = fileSchema.parse({ sites });
    const tmp = `${sitesPath}.${process.pid}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(parsed, null, 2)}\n`);
    renameSync(tmp, sitesPath);
    return parsed.sites;
}

export function publicSite(site) {
    const recon = site.recon;
    return {
        id: site.id,
        label: site.label || site.id,
        baseURL: site.baseURL,
        slugs: site.slugs,
        waitUntil: site.waitUntil ?? 'load',
        cacheBust: Boolean(site.cacheBust),
        recon: recon
            ? {
                  ranAt: recon.ranAt,
                  status: recon.status,
                  error: recon.error ?? null,
                  sitemapFiles: recon.sitemapFiles ?? [],
                  counts: recon.counts ?? {
                      sitemapFiles: recon.sitemapFiles?.length ?? 0,
                      sitemapLinks: recon.sitemapLinks?.length ?? 0,
                      homepageLinks: recon.homepageLinks?.length ?? 0,
                      urls: recon.urls?.length ?? site.slugs.length,
                  },
                  slugs: recon.slugs ?? site.slugs.filter((entry) => typeof entry === 'string'),
              }
            : null,
    };
}

export function slugPath(slug) {
    return typeof slug === 'string' ? slug : slug.path;
}

export function slugKey(slug) {
    return slugPath(slug).replace(/^\/+|\/+$/g, '');
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
