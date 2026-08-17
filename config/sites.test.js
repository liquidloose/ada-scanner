import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { getSite, loadSites, pageUrl, sheetName, slugPath } from './sites.js';

test('loadSites reads the committed config', () => {
    const sites = loadSites();
    assert.deepEqual(
        sites.map((site) => site.id),
        ['rivedge', 'at-scale', 'piezonis', 'gnbotf']
    );
    assert.equal(sites[0].baseURL, 'https://rivedge-site.ferret-boa.ts.net');
    assert.ok(sites.find((site) => site.id === 'gnbotf').axe.exclude.length > 0);
});

test('pageUrl joins base and slug without double slashes', () => {
    assert.equal(pageUrl('https://gnbotf.org/', ''), 'https://gnbotf.org');
    assert.equal(pageUrl('https://gnbotf.org/', 'home'), 'https://gnbotf.org/home');
    assert.equal(pageUrl('https://piezonis.com', 'menu'), 'https://piezonis.com/menu');
});

test('sheetName sanitizes paths and honors overrides', () => {
    assert.equal(sheetName(''), 'home');
    assert.equal(sheetName('events/scale-networking'), 'events_scale_networking');
    assert.equal(sheetName({ path: 'loc/warwick-pizza/', sheet: 'warwick-pizza' }), 'warwick-pizza');
    assert.equal(slugPath({ path: 'loc/catering-inquiry' }), 'loc/catering-inquiry');
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
