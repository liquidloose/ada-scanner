import { DownloadIcon, Trash2Icon } from 'lucide-react';
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
import { formatSize, formatSavedAt, type SavedScan } from '@/lib/api';

type SavedScansBlockProps = {
    scans: SavedScan[];
    selected: number[];
    busy?: boolean;
    onToggle: (id: number, checked: boolean) => void;
    onToggleAll: (checked: boolean) => void;
    onDownloadSelected: () => void;
    onDeleteSelected: () => void;
    onDeleteOne: (id: number) => void;
};

export function SavedScansBlock({
    scans,
    selected,
    busy = false,
    onToggle,
    onToggleAll,
    onDownloadSelected,
    onDeleteSelected,
    onDeleteOne,
}: SavedScansBlockProps) {
    const selectedSet = new Set(selected);
    const allSelected = scans.length > 0 && selected.length === scans.length;
    const someSelected = selected.length > 0;
    const mixed = someSelected && !allSelected;

    return (
        <Card id="saved-scans-panel" className="w-full min-w-0">
            <CardHeader>
                <CardTitle>Saved scans</CardTitle>
                <CardDescription>
                    Timestamped copies of scan reports and spreadsheets stored in the local database.
                </CardDescription>
                {scans.length > 0 ? (
                    <CardAction className="flex flex-wrap gap-2">
                        <Button
                            id="saved-scans-download-selected"
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={!someSelected}
                            onClick={onDownloadSelected}
                        >
                            <DownloadIcon data-icon="inline-start" />
                            Download selected
                        </Button>
                        <Button
                            id="saved-scans-delete-selected"
                            type="button"
                            variant="destructive"
                            size="sm"
                            disabled={!someSelected || busy}
                            onClick={onDeleteSelected}
                        >
                            <Trash2Icon data-icon="inline-start" />
                            Delete selected
                        </Button>
                    </CardAction>
                ) : null}
            </CardHeader>
            <CardContent>
                {scans.length === 0 ? (
                    <p id="saved-scans-empty" className="text-sm text-muted-foreground">
                        No saved scans yet.
                    </p>
                ) : (
                    <div id="saved-scans-table" className="max-h-64 w-full min-w-0 overflow-auto rounded-xl border border-border">
                        <Table className="table-fixed">
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-10">
                                        <Checkbox
                                            id="saved-scans-select-all"
                                            checked={allSelected}
                                            indeterminate={mixed}
                                            aria-label="Select all"
                                            onCheckedChange={(checked) => onToggleAll(checked === true)}
                                        />
                                    </TableHead>
                                    <TableHead className="w-44">Saved at</TableHead>
                                    <TableHead>Site</TableHead>
                                    <TableHead className="w-20">Files</TableHead>
                                    <TableHead className="w-24">Size</TableHead>
                                    <TableHead className="w-40 text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody id="saved-scans-list">
                                {scans.map((scan) => (
                                    <TableRow key={scan.id}>
                                        <TableCell>
                                            <Checkbox
                                                checked={selectedSet.has(scan.id)}
                                                aria-label={`Select ${formatSavedAt(scan.createdAt)}`}
                                                onCheckedChange={(checked) => onToggle(scan.id, checked === true)}
                                            />
                                        </TableCell>
                                        <TableCell className="font-medium">{formatSavedAt(scan.createdAt)}</TableCell>
                                        <TableCell
                                            className="truncate text-muted-foreground"
                                            title={scan.siteUrl || scan.suiteId || undefined}
                                        >
                                            {scan.siteUrl || scan.suiteId || '—'}
                                        </TableCell>
                                        <TableCell className="text-muted-foreground">{scan.fileCount}</TableCell>
                                        <TableCell className="text-muted-foreground">{formatSize(scan.size)}</TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex justify-end gap-2">
                                                <a
                                                    className={buttonVariants({ variant: 'outline', size: 'sm' })}
                                                    href={scan.href}
                                                    download
                                                >
                                                    Download
                                                </a>
                                                <Button
                                                    type="button"
                                                    variant="destructive"
                                                    size="sm"
                                                    disabled={busy}
                                                    onClick={() => onDeleteOne(scan.id)}
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
            </CardContent>
        </Card>
    );
}
