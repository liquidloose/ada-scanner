import { waitForRun } from './service.js';

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

    async function jsonRequest(path, options = {}) {
        const { response, body } = await request(path, options);
        return { ok: response.ok, status: response.status, data: body };
    }

    const client = {
        async getHealth() {
            return jsonRequest('/api/health');
        },
        async listSuites() {
            return jsonRequest('/api/suites');
        },
        async startRun(id) {
            return jsonRequest('/api/runs', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ id }),
            });
        },
        async getCurrentRun() {
            return jsonRequest('/api/runs/current');
        },
        async stopRun() {
            return jsonRequest('/api/runs/current/stop', { method: 'POST' });
        },
        async waitForRun(options) {
            return waitForRun(() => client.getCurrentRun(), options);
        },
        async getReportStatus() {
            return jsonRequest('/api/report');
        },
        async deleteReport() {
            return jsonRequest('/api/report', { method: 'DELETE' });
        },
        async listSpreadsheets() {
            return jsonRequest('/api/spreadsheets');
        },
        async combineSpreadsheets() {
            return jsonRequest('/api/spreadsheets/combine', { method: 'POST' });
        },
        async deleteSpreadsheet(name) {
            return jsonRequest(`/api/spreadsheets/${encodeURIComponent(name)}`, { method: 'DELETE' });
        },
        async deleteSpreadsheets(names) {
            return jsonRequest('/api/spreadsheets/delete', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ names }),
            });
        },
    };

    return client;
}
