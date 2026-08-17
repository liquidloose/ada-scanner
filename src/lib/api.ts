export type Suite = {
    id: string;
    label: string;
    script: string;
};

export type SpreadsheetFile = {
    name: string;
    size: number;
    mtime: string;
    href: string;
};

export type RunEvent =
    | { type: 'start'; id: string }
    | { type: 'log'; text: string }
    | { type: 'done'; ok: boolean; id: string; code: number; busy: boolean; report: boolean };

export function formatSize(bytes: number) {
    if (bytes < 1024) {
        return `${bytes} B`;
    }
    if (bytes < 1024 * 1024) {
        return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function filenameFromDisposition(header: string | null, fallback: string) {
    const match = /filename="([^"]+)"/.exec(header ?? '');
    return match?.[1] || fallback;
}

export function downloadBlob(blob: Blob, filename: string) {
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
}

export async function readNdjson(response: Response, onEvent: (event: RunEvent) => void) {
    const reader = response.body?.getReader();
    if (!reader) {
        throw new Error('No response body');
    }
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
        const { value, done } = await reader.read();
        if (done) {
            break;
        }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
            if (line.trim()) {
                onEvent(JSON.parse(line) as RunEvent);
            }
        }
    }
    if (buffer.trim()) {
        onEvent(JSON.parse(buffer) as RunEvent);
    }
}
