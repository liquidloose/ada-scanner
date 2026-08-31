import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ListIcon, RadarIcon, Trash2Icon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { formatSavedAt, slugKey, slugLabel, type Site } from '@/lib/api';

type SitesBlockProps = {
    sites: Site[];
    busy?: boolean;
    adding?: boolean;
    reconningId?: string | null;
    deletingSlugs?: boolean;
    onAdd: (input: { url: string; label: string }) => Promise<void> | void;
    onRecon: (id: string) => Promise<void> | void;
    onDeleteSlugs: (id: string, slugs: string[]) => Promise<void> | void;
};

function reconSummary(site: Site) {
    if (!site.recon) {
        return 'Not run';
    }
    if (site.recon.status === 'failed') {
        return site.recon.error || 'Failed';
    }
    const counts = site.recon.counts;
    return `${counts.urls} URLs · ${counts.sitemapLinks} sitemap · ${counts.homepageLinks} homepage`;
}

function matchesQuery(site: Site, slug: Site['slugs'][number], query: string) {
    if (!query) {
        return true;
    }
    const haystack = `${slugLabel(slug)} ${slugKey(slug)} ${site.baseURL}`.toLowerCase();
    return haystack.includes(query);
}

export function SitesBlock({
    sites,
    busy = false,
    adding = false,
    reconningId = null,
    deletingSlugs = false,
    onAdd,
    onRecon,
    onDeleteSlugs,
}: SitesBlockProps) {
    const [url, setUrl] = useState('');
    const [label, setLabel] = useState('');
    const [openId, setOpenId] = useState<string | null>(null);
    const [query, setQuery] = useState('');
    const [selected, setSelected] = useState<string[]>([]);

    const openSite = sites.find((site) => site.id === openId) ?? null;
    const filteredSlugs = useMemo(() => {
        if (!openSite) {
            return [];
        }
        const needle = query.trim().toLowerCase();
        return openSite.slugs.filter((slug) => matchesQuery(openSite, slug, needle));
    }, [openSite, query]);
    const selectedSet = new Set(selected);
    const visibleKeys = filteredSlugs.map((slug) => slugKey(slug));
    const allSelected = visibleKeys.length > 0 && visibleKeys.every((key) => selectedSet.has(key));
    const someSelected = selected.length > 0;
    const mixed = someSelected && !allSelected;

    useEffect(() => {
        if (!openSite) {
            setSelected([]);
            return;
        }
        const keys = new Set(openSite.slugs.map((slug) => slugKey(slug)));
        setSelected((current) => current.filter((key) => keys.has(key)));
    }, [openSite]);

    async function submit(event: FormEvent) {
        event.preventDefault();
        await onAdd({ url, label });
        setUrl('');
        setLabel('');
    }

    function openSlugs(id: string) {
        setOpenId((current) => (current === id ? null : id));
        setQuery('');
        setSelected([]);
    }

    return (
        <Card id="sites-panel" className="scroll-mt-24">
            <CardHeader>
                <CardTitle>Sites</CardTitle>
                <CardDescription>
                    Add a site by URL. Site recon pokes sitemaps and scrapes the homepage with scrapling, then
                    dedupes those links into the scan URL list.
                </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6">
                <form className="grid gap-3 sm:grid-cols-[1fr_12rem_auto] sm:items-end" onSubmit={submit}>
                    <div className="grid gap-2">
                        <Label htmlFor="site-url">Site URL</Label>
                        <input
                            id="site-url"
                            type="url"
                            required
                            placeholder="https://example.com"
                            value={url}
                            disabled={busy || adding}
                            onChange={(event) => setUrl(event.target.value)}
                            className="h-8 w-full rounded-lg border border-border bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="site-label">Label</Label>
                        <input
                            id="site-label"
                            type="text"
                            placeholder="Optional"
                            value={label}
                            disabled={busy || adding}
                            onChange={(event) => setLabel(event.target.value)}
                            className="h-8 w-full rounded-lg border border-border bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
                        />
                    </div>
                    <Button id="site-add" type="submit" disabled={busy || adding} aria-busy={adding}>
                        {adding ? 'Adding…' : 'Add site'}
                    </Button>
                </form>
                {sites.length > 0 ? (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Site</TableHead>
                                <TableHead>Site recon</TableHead>
                                <TableHead className="text-right">Pages</TableHead>
                                <TableHead className="w-56" />
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {sites.map((site) => {
                                const running = reconningId === site.id;
                                const open = openId === site.id;
                                return (
                                    <TableRow key={site.id}>
                                        <TableCell>
                                            <p className="font-medium">{site.label}</p>
                                            <p className="text-muted-foreground">{site.baseURL}</p>
                                        </TableCell>
                                        <TableCell>
                                            <div className="grid gap-1">
                                                <Badge
                                                    variant={
                                                        site.recon?.status === 'failed'
                                                            ? 'destructive'
                                                            : site.recon
                                                              ? 'secondary'
                                                              : 'outline'
                                                    }
                                                >
                                                    {site.recon?.status === 'failed'
                                                        ? 'Failed'
                                                        : site.recon
                                                          ? 'Ready'
                                                          : 'Pending'}
                                                </Badge>
                                                <p className="text-muted-foreground">{reconSummary(site)}</p>
                                                {site.recon?.ranAt ? (
                                                    <p className="text-muted-foreground">{formatSavedAt(site.recon.ranAt)}</p>
                                                ) : null}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right tabular-nums">
                                            {site.slugs.length}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex flex-wrap justify-end gap-2">
                                                <Button
                                                    type="button"
                                                    variant={open ? 'secondary' : 'outline'}
                                                    size="sm"
                                                    aria-expanded={open}
                                                    aria-controls="site-slugs"
                                                    onClick={() => openSlugs(site.id)}
                                                >
                                                    <ListIcon data-icon="inline-start" />
                                                    {open ? 'Hide slugs' : 'View slugs'}
                                                </Button>
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    disabled={busy || adding || running}
                                                    aria-busy={running}
                                                    onClick={() => onRecon(site.id)}
                                                >
                                                    <RadarIcon data-icon="inline-start" />
                                                    {running ? 'Running…' : 'Run recon'}
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                ) : (
                    <p className="text-muted-foreground">No sites yet. Add a URL to start site recon.</p>
                )}
                {openSite ? (
                    <div id="site-slugs" className="grid gap-3 rounded-xl border border-border p-4">
                        <div className="flex flex-wrap items-end justify-between gap-3">
                            <div className="grid min-w-0 flex-1 gap-2">
                                <Label htmlFor="site-slug-search">Look up slugs for {openSite.label}</Label>
                                <input
                                    id="site-slug-search"
                                    type="search"
                                    placeholder="Filter by path, for example menu"
                                    value={query}
                                    onChange={(event) => setQuery(event.target.value)}
                                    className="h-8 w-full max-w-md rounded-lg border border-border bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                                />
                            </div>
                            <Button
                                id="site-slugs-delete-selected"
                                type="button"
                                variant="destructive"
                                size="sm"
                                disabled={!someSelected || busy || adding || deletingSlugs}
                                aria-busy={deletingSlugs}
                                onClick={() => onDeleteSlugs(openSite.id, selected)}
                            >
                                <Trash2Icon data-icon="inline-start" />
                                {deletingSlugs ? 'Deleting…' : 'Delete selected'}
                            </Button>
                        </div>
                        {filteredSlugs.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                                {openSite.slugs.length === 0
                                    ? 'No slugs on this site.'
                                    : 'No slugs match that lookup.'}
                            </p>
                        ) : (
                            <div className="max-h-80 overflow-auto rounded-xl border border-border">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="w-10">
                                                <Checkbox
                                                    id="site-slugs-select-all"
                                                    checked={allSelected}
                                                    indeterminate={mixed}
                                                    aria-label="Select all matching slugs"
                                                    onCheckedChange={(checked) => {
                                                        const on = checked === true;
                                                        setSelected(on ? visibleKeys : []);
                                                    }}
                                                />
                                            </TableHead>
                                            <TableHead>Slug</TableHead>
                                            <TableHead className="w-24 text-right">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {filteredSlugs.map((slug) => {
                                            const key = slugKey(slug);
                                            const checked = selectedSet.has(key);
                                            return (
                                                <TableRow key={`${openSite.id}:${key || 'home'}`}>
                                                    <TableCell>
                                                        <Checkbox
                                                            checked={checked}
                                                            aria-label={`Select ${slugLabel(slug)}`}
                                                            onCheckedChange={(value) => {
                                                                const on = value === true;
                                                                setSelected((current) =>
                                                                    on
                                                                        ? [...current, key]
                                                                        : current.filter((entry) => entry !== key)
                                                                );
                                                            }}
                                                        />
                                                    </TableCell>
                                                    <TableCell>
                                                        <p className="font-mono text-sm">{slugLabel(slug)}</p>
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="icon-xs"
                                                            disabled={busy || adding || deletingSlugs}
                                                            aria-label={`Delete ${slugLabel(slug)}`}
                                                            onClick={() => onDeleteSlugs(openSite.id, [key])}
                                                        >
                                                            <Trash2Icon />
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            </div>
                        )}
                    </div>
                ) : null}
            </CardContent>
        </Card>
    );
}
