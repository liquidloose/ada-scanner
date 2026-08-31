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
        async listSites() {
            return jsonRequest('/api/sites');
        },
        async addSite(body) {
            return jsonRequest('/api/sites', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(body ?? {}),
            });
        },
        async reconSite(id) {
            return jsonRequest(`/api/sites/${encodeURIComponent(id)}/recon`, { method: 'POST' });
        },
        async deleteSiteSlugs(id, slugs) {
            return jsonRequest(`/api/sites/${encodeURIComponent(id)}/slugs/delete`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ slugs }),
            });
        },
        async startRun(id, { projects } = {}) {
            return jsonRequest('/api/runs', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ id, projects }),
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
        async listAllureReports() {
            return jsonRequest('/api/allure');
        },
        async createAllureReport() {
            return jsonRequest('/api/allure', { method: 'POST' });
        },
        async deleteAllureReport(id) {
            return jsonRequest(`/api/allure/${encodeURIComponent(id)}`, { method: 'DELETE' });
        },
        async clearAllure() {
            return jsonRequest('/api/allure', { method: 'DELETE' });
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
        async saveCurrentScan() {
            return jsonRequest('/api/saved-scans', { method: 'POST' });
        },
        async listSavedScans() {
            return jsonRequest('/api/saved-scans');
        },
        async deleteSavedScan(id) {
            return jsonRequest(`/api/saved-scans/${encodeURIComponent(id)}`, { method: 'DELETE' });
        },
        async deleteSavedScans(ids) {
            return jsonRequest('/api/saved-scans/delete', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ ids }),
            });
        },
    };

    return client;
}
