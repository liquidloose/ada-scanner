import assert from 'node:assert/strict';
import test from 'node:test';
import {
    failedRecon,
    labelFromUrl,
    normalizeSiteUrl,
    siteIdFromUrl,
    summarizeRecon,
    urlToSlug,
    urlsToSlugs,
} from './site-recon.js';

test('normalizeSiteUrl adds https and keeps the origin', () => {
    assert.equal(normalizeSiteUrl('example.com'), 'https://example.com');
    assert.equal(normalizeSiteUrl('https://piezonis.com/menu'), 'https://piezonis.com');
    assert.equal(normalizeSiteUrl('not a url'), null);
    assert.equal(normalizeSiteUrl('not-a-site'), null);
    assert.equal(normalizeSiteUrl('ftp://example.com'), null);
    assert.equal(normalizeSiteUrl(''), null);
});

test('siteIdFromUrl uses the first hostname label and avoids collisions', () => {
    assert.equal(siteIdFromUrl('https://piezonis.com'), 'piezonis');
    assert.equal(siteIdFromUrl('https://www.gnbotf.org'), 'gnbotf');
    assert.equal(siteIdFromUrl('https://piezonis.com', ['piezonis']), 'piezonis-2');
    assert.equal(labelFromUrl('https://www.piezonis.com'), 'piezonis.com');
});

test('urlsToSlugs keeps home and drops other hosts', () => {
    assert.equal(urlToSlug('https://piezonis.com', 'https://piezonis.com/menu'), 'menu');
    assert.equal(urlToSlug('https://piezonis.com', 'https://other.com/menu'), null);
    assert.deepEqual(
        urlsToSlugs('https://piezonis.com', [
            'https://piezonis.com/menu',
            'https://piezonis.com/menu/',
            'https://other.com/x',
            'https://piezonis.com/',
        ]),
        ['menu', '']
    );
});

test('summarizeRecon dedupes sitemap and homepage links into slugs', () => {
    const recon = summarizeRecon(
        {
            sitemapFiles: ['https://piezonis.com/sitemap.xml'],
            sitemapLinks: ['https://piezonis.com/menu', 'https://piezonis.com/'],
            homepageLinks: ['https://piezonis.com/menu', 'https://piezonis.com/contact-us'],
            urls: ['https://piezonis.com/', 'https://piezonis.com/menu', 'https://piezonis.com/contact-us'],
        },
        'https://piezonis.com',
        new Date('2026-08-18T16:00:00.000Z')
    );
    assert.equal(recon.status, 'ok');
    assert.deepEqual(recon.slugs, ['', 'menu', 'contact-us']);
    assert.equal(recon.counts.urls, 3);
    assert.equal(failedRecon('nope').status, 'failed');
});
