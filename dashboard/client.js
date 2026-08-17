export function createScannerClient({
    baseUrl = process.env.ADA_SCANNER_URL || 'http://127.0.0.1:3847',
    fetchImpl = fetch,
} = {}) {
    const root = baseUrl.replace(/\/$/, '');

    async function request(path, options = {}) {
        const response = await fetchImpl(root + path, options);
        const contentType = response.headers.get('content-type') ?? '';
        const body = contentType.includes('json') ? await response.json() : await response.arrayBuffer();
        return { response, body };
    }

    return {
        async listSuites() {
            const { response, body } = await request('/api/suites');
            return { ok: response.ok, status: response.status, data: body };
        },
        async startRun(id) {
            const { response, body } = await request('/api/runs', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ id }),
            });
            return { ok: response.ok, status: response.status, data: body };
        },
        async getCurrentRun() {
            const { response, body } = await request('/api/runs/current');
            return { ok: response.ok, status: response.status, data: body };
        },
        async getReportStatus() {
            const { response, body } = await request('/api/report');
            return { ok: response.ok, status: response.status, data: body };
        },
        async listSpreadsheets() {
            const { response, body } = await request('/api/spreadsheets');
            return { ok: response.ok, status: response.status, data: body };
        },
        async deleteSpreadsheets(names) {
            const { response, body } = await request('/api/spreadsheets/delete', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ names }),
            });
            return { ok: response.ok, status: response.status, data: body };
        },
    };
}
