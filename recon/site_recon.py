#!/usr/bin/env python3
"""Poke a site: collect sitemap URLs and homepage links, then print JSON."""

from __future__ import annotations

import gzip
import json
import logging
import re
import sys
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

logging.getLogger("scrapling").setLevel(logging.WARNING)
logging.getLogger().setLevel(logging.WARNING)

LOC_RE = re.compile(r"<loc>\s*([^<\s]+)\s*</loc>", re.I)
SITEMAP_LINE_RE = re.compile(r"(?im)^\s*sitemap:\s*(\S+)")
TRACKING_PARAMS = {"fbclid", "gclid", "mc_cid", "mc_eid"}
SKIP_SUFFIXES = (
    ".pdf",
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".svg",
    ".webp",
    ".ico",
    ".css",
    ".js",
    ".mjs",
    ".map",
    ".woff",
    ".woff2",
    ".ttf",
    ".eot",
    ".zip",
    ".gz",
    ".mp4",
    ".webm",
    ".mp3",
    ".xml",
    ".json",
    ".txt",
    ".rss",
    ".atom",
)
MAX_SITEMAPS = 40
MAX_URLS = 1000
COMMON_SITEMAPS = (
    "/sitemap.xml",
    "/sitemap_index.xml",
    "/wp-sitemap.xml",
    "/sitemap.xml.gz",
)


def host_key(hostname: str) -> str:
    return hostname.lower().removeprefix("www.")


def same_site(url: str, origin_host: str) -> bool:
    try:
        host = urlsplit(url).hostname or ""
    except ValueError:
        return False
    left = host_key(host)
    right = host_key(origin_host)
    return left == right or left.endswith("." + right)


def canonicalize(url: str, origin_host: str) -> str | None:
    try:
        parts = urlsplit(url.strip())
    except ValueError:
        return None
    if parts.scheme not in ("http", "https"):
        return None
    if not parts.hostname or not same_site(url, origin_host):
        return None
    path = re.sub(r"/{2,}", "/", parts.path or "/")
    lowered = path.lower()
    if any(lowered.endswith(suffix) for suffix in SKIP_SUFFIXES):
        return None
    if path != "/" and path.endswith("/"):
        path = path[:-1]
    query_pairs = [
        (key, value)
        for key, value in parse_qsl(parts.query, keep_blank_values=True)
        if key.lower() not in TRACKING_PARAMS and not key.lower().startswith("utm_")
    ]
    query = urlencode(query_pairs)
    netloc = parts.hostname.lower()
    if parts.port and parts.port not in (80, 443):
        netloc = f"{netloc}:{parts.port}"
    return urlunsplit((parts.scheme.lower(), netloc, path or "/", query, ""))


def decode_body(page) -> str:
    body = page.body if hasattr(page, "body") else b""
    if isinstance(body, str):
        body = body.encode("utf-8", errors="replace")
    if body[:2] == b"\x1f\x8b":
        body = gzip.decompress(body)
    encoding = getattr(page, "encoding", None) or "utf-8"
    return body.decode(encoding, errors="replace")


def fetch(url: str):
    from scrapling.fetchers import Fetcher

    try:
        return Fetcher.get(url, impersonate="chrome")
    except TypeError:
        return Fetcher.get(url)


def loc_values(text: str) -> list[str]:
    return [match.group(1).strip() for match in LOC_RE.finditer(text)]


def discover_sitemaps(origin: str, origin_host: str) -> list[str]:
    found: list[str] = []
    seen: set[str] = set()

    def add(url: str) -> None:
        clean = url.strip()
        if not clean or clean in seen:
            return
        seen.add(clean)
        found.append(clean)

    try:
        robots = fetch(origin.rstrip("/") + "/robots.txt")
        text = decode_body(robots)
        for match in SITEMAP_LINE_RE.finditer(text):
            add(match.group(1))
    except Exception as error:
        print(f"robots.txt: {error}", file=sys.stderr)

    for path in COMMON_SITEMAPS:
        add(origin.rstrip("/") + path)
    return [url for url in found if same_site(url, origin_host)][:MAX_SITEMAPS]


def collect_sitemap_links(sitemap_files: list[str], origin_host: str) -> tuple[list[str], list[str]]:
    queue = list(sitemap_files)
    used: list[str] = []
    links: list[str] = []
    seen_files: set[str] = set()
    seen_links: set[str] = set()

    while queue and len(used) < MAX_SITEMAPS and len(links) < MAX_URLS:
        sitemap_url = queue.pop(0)
        if sitemap_url in seen_files:
            continue
        seen_files.add(sitemap_url)
        try:
            page = fetch(sitemap_url)
            status = getattr(page, "status", 0) or 0
            if status >= 400:
                continue
            text = decode_body(page)
        except Exception as error:
            print(f"sitemap {sitemap_url}: {error}", file=sys.stderr)
            continue
        lowered = text.lower()
        if "<urlset" not in lowered and "<sitemapindex" not in lowered:
            continue
        used.append(sitemap_url)
        nested = "<sitemapindex" in text.lower()
        for loc in loc_values(text):
            if nested:
                if loc not in seen_files and same_site(loc, origin_host):
                    queue.append(loc)
                continue
            canonical = canonicalize(loc, origin_host)
            if not canonical or canonical in seen_links:
                continue
            seen_links.add(canonical)
            links.append(canonical)
            if len(links) >= MAX_URLS:
                break
    return used, links


def homepage_links(home: str, origin_host: str) -> list[str]:
    from scrapling.spiders import LinkExtractor

    page = fetch(home)
    extractor = LinkExtractor(allow_domains=origin_host, canonicalize=True)
    try:
        raw = extractor.extract(page)
    except TypeError:
        raw = extractor.extract(page, home)
    links: list[str] = []
    seen: set[str] = set()
    for item in raw or []:
        canonical = canonicalize(str(item), origin_host)
        if not canonical or canonical in seen:
            continue
        seen.add(canonical)
        links.append(canonical)
    return links


def recon(raw_url: str) -> dict:
    parts = urlsplit(raw_url)
    if parts.scheme not in ("http", "https") or not parts.hostname:
        raise ValueError("base URL must be http(s)")
    origin = f"{parts.scheme}://{parts.hostname}" + (f":{parts.port}" if parts.port else "")
    origin_host = parts.hostname
    home = canonicalize(origin + "/", origin_host) or origin + "/"

    sitemap_candidates = discover_sitemaps(origin, origin_host)
    sitemap_files, sitemap_urls = collect_sitemap_links(sitemap_candidates, origin_host)
    try:
        home_urls = homepage_links(home, origin_host)
    except Exception as error:
        print(f"homepage: {error}", file=sys.stderr)
        home_urls = []

    seen: set[str] = {home}
    urls = [home]
    for item in sitemap_urls + home_urls:
        if item in seen:
            continue
        seen.add(item)
        urls.append(item)
        if len(urls) >= MAX_URLS:
            break

    return {
        "baseURL": origin,
        "sitemapFiles": sitemap_files,
        "sitemapLinks": sitemap_urls,
        "homepageLinks": home_urls,
        "urls": urls,
    }


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: site_recon.py <url>", file=sys.stderr)
        return 2
    try:
        payload = recon(sys.argv[1])
    except Exception as error:
        print(json.dumps({"ok": False, "error": str(error)}))
        return 1
    print(json.dumps(payload))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
