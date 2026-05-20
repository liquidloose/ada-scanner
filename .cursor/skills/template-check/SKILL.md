---
name: template-check
description: >-
  Group axe-core accessibility scan results by shared WordPress / Elementor /
  Gutenberg template so the user only walks one representative page per template
  group instead of every page. Identifies theme-level color failures that fix
  many pages at once, surfaces site-wide chrome issues (header/footer), and
  flags pages with unique findings that still need an individual check. Use
  when the user runs /template-check, pastes axe scan rows into chat, points
  at a results file (results/*.json, results/*.tsv, results/*.csv), or asks to
  group/cluster/dedupe accessibility findings by template, layout, or shared
  components. Produces a Canvas walkthrough plan plus a short chat summary.
---

# template-check

Turn a wall of axe-core findings into a short walkthrough plan: which fixes are
theme-level (one change covers many pages), which pages share a template (check
one, skip the rest), and which pages have unique findings that still need an
individual look.

## When to run

Trigger when the user:

- Types `/template-check` or asks to "run template-check".
- Pastes axe scan rows into chat (TSV or CSV; columns usually include
  `page`, `device`, `id`, `impact`, `tags`, `help`, `helpUrl`, `html`, `target`,
  `failureSummary`).
- Points at a scan results file under `results/` (or wherever the project
  writes them — check `tests/` and the `package.json` scripts if unsure).
- Asks to "group", "cluster", "dedupe", or "find the template" for a set of
  accessibility findings.

If only a handful of findings exist (< ~10 rows, < 3 pages), skip the full
workflow and just answer in chat. The template-grouping value only kicks in
when there's enough repetition to dedupe.

## Inputs the skill accepts

1. **Pasted rows in chat.** TSV or CSV. Assume the column order axe + Playwright
   produces:
   `page \t device \t id \t impact \t tags \t description \t help \t helpUrl \t html \t target \t failureSummary`.
2. **A file path.** JSON, TSV, or CSV under the project. Read it directly.
3. **A glob / directory.** If the user points at `results/` or similar, read
   the most recent file (`ls -t`, top entry).

If the input shape is ambiguous, ask once which input to use, then proceed.

## Workflow

Copy this checklist and track progress:

```
- [ ] Step 1: Load the scan data
- [ ] Step 2: Extract failure signals (rule id, colors, CSS targets, html snippet)
- [ ] Step 3: Cluster by template
- [ ] Step 4: Pick one representative page per cluster
- [ ] Step 5: Separate theme-level vs page-unique findings
- [ ] Step 6: Render Canvas + chat summary
```

### Step 1 — Load the scan data

- Pasted → parse the rows directly.
- File → read the file. For JSON, the axe shape is usually
  `{ violations: [{ id, impact, tags, help, helpUrl, nodes: [{ html, target, failureSummary }] }] }`.
  For TSV/CSV, the column order above is the default.

### Step 2 — Extract failure signals

For each finding, capture:

- **Rule id** (`color-contrast`, `link-in-text-block`, `link-name`, `label`,
  `frame-title`, `aria-required-children`, etc.).
- **Color combo** when the `failureSummary` includes a contrast ratio — pull
  the foreground hex, background hex, and ratio (e.g.
  `#35845d on #eef4f7 = 4.1:1`).
- **CSS class fingerprints** from `target` and `html`:
  - `elementor-*`, `elementor-icon-box-*`, `elementor-button-*` → Elementor.
  - `wp-block-*` → Gutenberg block.
  - `grunion-*`, `contact-form-comment-*` → Jetpack Grunion form.
  - `wp-block-jetpack-*` → other Jetpack blocks.
  - `ntb_*`, `ninja_tables_*` → NinjaTables plugin.
  - `iframe` + `calendar.google.com` → embedded Google Calendar.
- **Page slug** (the `page` column / URL path).

### Step 3 — Cluster by template

Group pages whose findings share the same fingerprint set. Useful axes:

- **Color clusters** — every page that uses the same failing fg/bg combo is in
  the same theme cluster. These resolve together when the theme color changes.
- **Layout clusters** — pages whose findings come from the same class families
  (e.g. mostly `wp-block-*` paragraph + link styles = Gutenberg resource list;
  mostly `elementor-icon-box` + `elementor-button` = Elementor topic page;
  `grunion-*` = Jetpack form).
- **Plugin clusters** — pages with findings on a single distinctive plugin
  selector (NinjaTables, Google Calendar iframe, etc.) are usually their own
  one-page cluster.

A page can sit in more than one cluster (e.g. it uses the topic-page template
AND has a Jetpack form). That's fine — surface both.

### Step 4 — Pick one representative page per cluster

For each cluster, pick the page that hits the most distinct failure variants
in that cluster. Mark it as the "check this one" page; the rest are skippable
as long as the theme fixes land.

### Step 5 — Separate theme-level vs page-unique findings

- **Theme-level** — color combos that recur on 2+ pages, or chrome elements
  (header logo, footer, nav) that only show up on one page in the scan but
  obviously live site-wide. List affected pages per fix.
- **Site-wide chrome** — call out separately. The empty `<a href="/">` logo
  link is a classic example: axe only reports it once but it's on every page.
- **Page-unique** — anything that doesn't generalize: a single missing
  `<label>`, an unlabeled `<iframe>`, a plugin-specific aria violation, a
  one-off contrast on a dark panel. These need individual checks.

### Step 6 — Render Canvas + chat summary

Always produce both:

1. **Canvas** — at
   `~/.cursor/projects/<workspace>/canvases/template-check-<scan-label>.canvas.tsx`.
   `<scan-label>` is a short kebab-case tag derived from the scan (site name,
   date, or whatever distinguishes this run from earlier ones). Read the
   `canvas` skill before writing the file. Use the layout below.
2. **Chat summary** — 4–8 lines under the canvas link recapping: total pages,
   number of clusters, the representative pages to check, and any
   site-wide/page-unique callouts.

## Canvas layout

Follow this structure (matches the proven layout for `gnbotf.org`):

1. **Title + one-sentence framing.**
2. **Stat strip** — total pages scanned, cluster count, theme-level color
   fixes, pages needing individual check.
3. **Top callout** — "the short version": fix theme colors + chrome, then walk
   only the representatives + unique pages.
4. **Theme-level color table** — columns: color swatch + hex pair, current
   ratio, role/use, affected pages. Use the small `Swatch` inline component
   pattern (`fg` text on `bg` background, "Aa" label) for visual scanning.
5. **`link-in-text-block` callout** if any such findings exist — remind the
   user that the "no underline" half also clears with a global rule.
6. **Site-wide chrome section** — one card per recurring chrome element
   (header logo, footer, etc.).
7. **Template groups** — one `Card` per cluster with: pattern description,
   shared failures, a `Row` of `Pill`s listing the pages (representative
   marked `active tone="info"` with "← check this one").
8. **Pages needing individual check** — `Table` with page, why, severity
   pill (`critical` / `serious`).
9. **Suggested walkthrough order** — numbered pills (1, 2, 3, 4).
10. **Source line** — tiny `tone="tertiary"` footer naming the axe version
    and run.

Do not render empty sections — omit any that don't apply to this scan.

## Chat summary template

```
Canvas: <path/to/canvas>

<N> pages → <M> template groups. <K> color fixes + <chrome item> resolve at the theme level.

Walk these representatives: <page-1>, <page-2>, ...

Individual check still needed: <page-x> (<why>), <page-y> (<why>).
```

Keep it under 8 lines. The Canvas is the deliverable; the chat summary just
orients the user.

## Examples of fingerprints → clusters

| Fingerprint in `target` / `html`                          | Cluster                            |
| --------------------------------------------------------- | ---------------------------------- |
| `wp-block-paragraph`, `wp-block-column`, plain `<a>` text | Gutenberg resource/link-list page  |
| `elementor-icon-box-description`, `elementor-button-link` | Elementor topic page               |
| `grunion-field`, `grunion-label-required`                 | Jetpack Grunion form page          |
| `wp-block-jetpack-email`, `wp-block-jetpack-phone`        | Jetpack contact block              |
| `iframe[src*="calendar.google.com"]`                      | Embedded Google Calendar           |
| `#ntb_table`, `ninja_tables_*`                            | NinjaTables plugin table           |
| `a[href="/"]` with empty text                             | Site-wide header logo (every page) |

## Anti-patterns

- **Do not list every failing element.** That defeats the purpose. Group, then
  point at one representative.
- **Do not invent clusters from a single page.** A "cluster" needs ≥ 2 pages
  unless the page itself is genuinely unique (plugin, embed).
- **Do not skip the Canvas.** The walkthrough is visual — markdown in chat
  loses the swatches and grouping affordance.
- **Do not include `(N/A)` rows or empty tables.** Omit sections that don't
  apply.
