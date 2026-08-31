import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { getSite, loadSites, pageUrl, publicSite, resolveScanProjects, sheetFileName, sheetName, siteAddress, siteUrl, slugKey, slugPath, withSiteAddress, writeSites } from './sites.js';

test('loadSites reads the committed config', () => {
    const sites = loadSites();
    const ids = sites.map((site) => site.id);
    for (const id of ['rivedge', 'at-scale', 'piezonis', 'gnbotf']) {
        assert.ok(ids.includes(id), id);
    }
    assert.equal(sites[0].baseURL, 'https://rivedge-site.ferret-boa.ts.net');
    assert.ok(sites.find((site) => site.id === 'gnbotf').axe.exclude.length > 0);
});

test('americanglobaltelecom adds Safari, iPhone, and iPad projects', () => {
    assert.deepEqual(getSite('americanglobaltelecom').projects, [
        'chromium',
        'Mobile Chrome',
        'webkit',
        'Mobile Safari',
        'iPad',
    ]);
});

test('resolveScanProjects uses site defaults or requested names', () => {
    assert.deepEqual(resolveScanProjects(undefined, { projects: ['webkit'] }).projects, ['webkit']);
    assert.deepEqual(resolveScanProjects(undefined, {}).projects, ['chromium', 'Mobile Chrome']);
    assert.deepEqual(resolveScanProjects(['iPad', 'iPad', 'chromium']).projects, ['iPad', 'chromium']);
    assert.equal(resolveScanProjects([]).ok, false);
    assert.equal(resolveScanProjects([]).reason, 'no-projects');
    assert.equal(resolveScanProjects(['firefox']).reason, 'unknown-project');
});

test('piezonis and rivedge wait for load instead of networkidle', () => {
    for (const id of ['piezonis', 'rivedge']) {
        assert.equal(getSite(id).waitUntil ?? 'load', 'load');
    }
});

test('pageUrl joins base and slug without double slashes', () => {
    assert.equal(pageUrl('https://gnbotf.org/', ''), 'https://gnbotf.org');
    assert.equal(pageUrl('https://gnbotf.org/', 'home'), 'https://gnbotf.org/home');
    assert.equal(pageUrl('https://piezonis.com', 'menu'), 'https://piezonis.com/menu');
});

test('slugKey strips slashes for home and nested paths', () => {
    assert.equal(slugKey(''), '');
    assert.equal(slugKey('/menu/'), 'menu');
    assert.equal(slugKey({ path: 'loc/warwick-pizza/' }), 'loc/warwick-pizza');
});

test('sheetName sanitizes paths and honors overrides', () => {
    assert.equal(sheetName(''), 'home');
    assert.equal(sheetName('events/scale-networking'), 'events_scale_networking');
    assert.equal(sheetName({ path: 'loc/warwick-pizza/', sheet: 'warwick-pizza' }), 'warwick-pizza');
    assert.equal(slugPath({ path: 'loc/catering-inquiry' }), 'loc/catering-inquiry');
});

test('siteAddress and sheetFileName prefix files with the host', () => {
    assert.equal(siteAddress('https://piezonis.com'), 'piezonis.com');
    assert.equal(siteAddress('https://gnbotf.org/'), 'gnbotf.org');
    assert.equal(siteAddress('https://rivedge-site.ferret-boa.ts.net'), 'rivedge-site.ferret-boa.ts.net');
    assert.equal(siteUrl('https://gnbotf.org/'), 'https://gnbotf.org');
    assert.equal(sheetFileName('https://piezonis.com', ''), 'piezonis.com_home');
    assert.equal(sheetFileName('https://piezonis.com', 'menu'), 'piezonis.com_menu');
    assert.equal(withSiteAddress('https://piezonis.com', 'master-list.xlsx'), 'piezonis.com_master-list.xlsx');
    assert.equal(withSiteAddress('https://piezonis.com', 'piezonis.com_home.xlsx'), 'piezonis.com_home.xlsx');
});

test('writeSites persists a new site with recon', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'ada-sites-write-'));
    const file = path.join(dir, 'sites.json');
    await writeFile(
        file,
        JSON.stringify({
            sites: [{ id: 'demo', baseURL: 'https://example.com', slugs: [''] }],
        })
    );
    const sites = loadSites(file);
    writeSites(
        [
            ...sites,
            {
                id: 'piezonis',
                label: "Piezoni's",
                baseURL: 'https://piezonis.com',
                slugs: ['', 'menu'],
                recon: {
                    ranAt: '2026-08-18T16:00:00.000Z',
                    status: 'ok',
                    sitemapFiles: ['https://piezonis.com/sitemap.xml'],
                    counts: { sitemapFiles: 1, sitemapLinks: 1, homepageLinks: 1, urls: 2 },
                    slugs: ['', 'menu'],
                },
            },
        ],
        file
    );
    const loaded = loadSites(file);
    assert.equal(loaded.length, 2);
    assert.equal(loaded[1].recon.status, 'ok');
    assert.equal(publicSite(loaded[1]).recon.counts.urls, 2);
});

test('getSite rejects unknown ids', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'ada-sites-'));
    const file = path.join(dir, 'sites.json');
    await writeFile(
        file,
        JSON.stringify({
            sites: [{ id: 'demo', baseURL: 'https://example.com', slugs: [''] }],
        })
    );
    assert.equal(getSite('demo', file).label, undefined);
    assert.throws(() => getSite('missing', file), /Unknown SITE_ID/);
    assert.throws(() => getSite('', file), /SITE_ID is required/);
});
