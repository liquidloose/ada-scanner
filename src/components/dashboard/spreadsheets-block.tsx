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
import { formatSize, type SpreadsheetFile } from '@/lib/api';

type SpreadsheetsBlockProps = {
    files: SpreadsheetFile[];
    selected: string[];
    onToggle: (name: string, checked: boolean) => void;
    onToggleAll: (checked: boolean) => void;
    onDownloadSelected: () => void;
    onDeleteSelected: () => void;
    onDeleteOne: (name: string) => void;
};

export function SpreadsheetsBlock({
    files,
    selected,
    onToggle,
    onToggleAll,
    onDownloadSelected,
    onDeleteSelected,
    onDeleteOne,
}: SpreadsheetsBlockProps) {
    const selectedSet = new Set(selected);
    const allSelected = files.length > 0 && selected.length === files.length;
    const someSelected = selected.length > 0;
    const mixed = someSelected && !allSelected;

    return (
        <Card id="spreadsheets-panel">
            <CardHeader>
                <CardTitle>Spreadsheets</CardTitle>
                <CardDescription>
                    Download or delete Excel reports from the last scans.
                </CardDescription>
                {files.length > 0 ? (
                    <CardAction className="flex flex-wrap gap-2">
                        <Button
                            id="spreadsheets-download-selected"
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
                            id="spreadsheets-delete-selected"
                            type="button"
                            variant="destructive"
                            size="sm"
                            disabled={!someSelected}
                            onClick={onDeleteSelected}
                        >
                            <Trash2Icon data-icon="inline-start" />
                            Delete selected
                        </Button>
                    </CardAction>
                ) : null}
            </CardHeader>
            <CardContent>
                {files.length === 0 ? (
                    <p id="spreadsheets-empty" className="text-sm text-muted-foreground">
                        No spreadsheet files yet.
                    </p>
                ) : (
                    <div id="spreadsheets-table" className="max-h-64 overflow-auto rounded-lg ring-1 ring-foreground/10">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-10">
                                        <Checkbox
                                            id="spreadsheets-select-all"
                                            checked={allSelected}
                                            indeterminate={mixed}
                                            aria-label="Select all"
                                            onCheckedChange={(checked) => onToggleAll(checked === true)}
                                        />
                                    </TableHead>
                                    <TableHead>File</TableHead>
                                    <TableHead className="w-24">Size</TableHead>
                                    <TableHead className="w-40 text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody id="spreadsheets-list">
                                {files.map((file) => (
                                    <TableRow key={file.name}>
                                        <TableCell>
                                            <Checkbox
                                                checked={selectedSet.has(file.name)}
                                                aria-label={`Select ${file.name}`}
                                                onCheckedChange={(checked) => onToggle(file.name, checked === true)}
                                            />
                                        </TableCell>
                                        <TableCell className="max-w-xs truncate font-medium">{file.name}</TableCell>
                                        <TableCell className="text-muted-foreground">{formatSize(file.size)}</TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex justify-end gap-2">
                                                <a
                                                    className={buttonVariants({ variant: 'outline', size: 'sm' })}
                                                    href={file.href}
                                                    download={file.name}
                                                >
                                                    Download
                                                </a>
                                                <Button
                                                    type="button"
                                                    variant="destructive"
                                                    size="sm"
                                                    data-name={file.name}
                                                    onClick={() => onDeleteOne(file.name)}
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
