import { ExternalLinkIcon, FileChartColumn, Trash2Icon } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import {
    Card,
    CardAction,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { formatSavedAt, formatSize, type AllureReport } from '@/lib/api';

type AllureReportsBlockProps = {
    reports: AllureReport[];
    results?: boolean;
    selected: string[];
    busy?: boolean;
    creating?: boolean;
    onCreate: () => void;
    onToggle: (id: string, checked: boolean) => void;
    onToggleAll: (checked: boolean) => void;
    onDeleteSelected: () => void;
    onDeleteOne: (id: string) => void;
};

export function AllureReportsBlock({
    reports,
    results = false,
    selected,
    busy = false,
    creating = false,
    onCreate,
    onToggle,
    onToggleAll,
    onDeleteSelected,
    onDeleteOne,
}: AllureReportsBlockProps) {
    const selectedSet = new Set(selected);
    const allSelected = reports.length > 0 && selected.length === reports.length;
    const someSelected = selected.length > 0;
    const mixed = someSelected && !allSelected;
    const viewing = selected.length === 1 ? reports.find((report) => report.id === selected[0]) ?? null : null;

    return (
        <Card id="allure-panel" className="scroll-mt-24">
            <CardHeader>
                <CardTitle>Allure reports</CardTitle>
                <CardDescription>
                    Create a timestamped Allure report from the latest scan, then select one to display it below.
                </CardDescription>
                <CardAction className="flex flex-wrap gap-2">
                    <Button
                        id="allure-create"
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={!results || busy || creating}
                        aria-busy={creating}
                        onClick={onCreate}
                    >
                        <FileChartColumn data-icon="inline-start" />
                        {creating ? 'Creating…' : 'Create Allure report'}
                    </Button>
                    {reports.length > 0 ? (
                        <Button
                            id="allure-delete-selected"
                            type="button"
                            variant="destructive"
                            size="sm"
                            disabled={!someSelected || busy}
                            onClick={onDeleteSelected}
                        >
                            <Trash2Icon data-icon="inline-start" />
                            Delete selected
                        </Button>
                    ) : null}
                </CardAction>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
                {reports.length === 0 ? (
                    <p id="allure-empty" className="text-sm text-muted-foreground">
                        {results
                            ? 'No Allure reports yet. Create one from the latest scan results.'
                            : 'Run a scan first, then create an Allure report.'}
                    </p>
                ) : (
                    <div id="allure-table" className="max-h-64 overflow-auto rounded-xl border border-border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-10">
                                        <Checkbox
                                            id="allure-select-all"
                                            checked={allSelected}
                                            indeterminate={mixed}
                                            aria-label="Select all"
                                            onCheckedChange={(checked) => onToggleAll(checked === true)}
                                        />
                                    </TableHead>
                                    <TableHead className="w-44">Created</TableHead>
                                    <TableHead>Site</TableHead>
                                    <TableHead className="w-24">Size</TableHead>
                                    <TableHead className="w-40 text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody id="allure-list">
                                {reports.map((report) => (
                                    <TableRow key={report.id}>
                                        <TableCell>
                                            <Checkbox
                                                checked={selectedSet.has(report.id)}
                                                aria-label={`Select ${formatSavedAt(report.createdAt)}`}
                                                onCheckedChange={(checked) => onToggle(report.id, checked === true)}
                                            />
                                        </TableCell>
                                        <TableCell className="font-medium">{formatSavedAt(report.createdAt)}</TableCell>
                                        <TableCell
                                            className="max-w-xs truncate text-muted-foreground"
                                            title={report.siteUrl || report.suiteId || undefined}
                                        >
                                            {report.siteUrl || report.suiteId || '—'}
                                        </TableCell>
                                        <TableCell className="text-muted-foreground">{formatSize(report.size)}</TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex justify-end gap-2">
                                                <a
                                                    className={buttonVariants({ variant: 'outline', size: 'sm' })}
                                                    href={report.href}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                >
                                                    <ExternalLinkIcon data-icon="inline-start" />
                                                    Open
                                                </a>
                                                <Button
                                                    type="button"
                                                    variant="destructive"
                                                    size="sm"
                                                    disabled={busy}
                                                    onClick={() => onDeleteOne(report.id)}
                                                >
                                                    Delete
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                )}
                {viewing ? (
                    <iframe
                        id="allure-frame"
                        title="Allure report"
                        src={viewing.href}
                        className="block h-[600px] max-h-[600px] w-full rounded-xl border border-border bg-card"
                    />
                ) : (
                    <div
                        id="allure-frame-empty"
                        className="flex h-[300px] max-h-[300px] items-center justify-center rounded-xl border border-border text-sm text-muted-foreground"
                    >
                        {reports.length === 0
                            ? 'Create a report, then select it to display it here.'
                            : 'Select one report to display it here.'}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
