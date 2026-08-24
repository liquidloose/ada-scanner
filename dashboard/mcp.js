import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { createScannerClient } from './client.js';
import { createScannerService, defaultSavedScansDb } from './service.js';

export const scannerTools = [
    {
        name: 'list_suites',
        title: 'List suites',
        description: 'List ADA Scanner site suites and whether a scan is already running.',
    },
    {
        name: 'start_scan',
        title: 'Start scan',
        description: 'Start a site suite. Then call wait_for_scan, or poll get_scan_status until status is finished. A scan with no Playwright output for 60s is stopped as hung.',
    },
    {
        name: 'stop_scan',
        title: 'Stop scan',
        description: 'Kill the current scan, including hung Playwright processes, so a new suite can start.',
    },
    {
        name: 'get_scan_status',
        title: 'Get scan status',
        description: 'Read the current or last scan: idle, running, or finished, plus logs, exit code, hung, and report availability. Silent scans are stopped automatically after 60s.',
    },
    {
        name: 'wait_for_scan',
        title: 'Wait for scan',
        description: 'Block until the current scan finishes, then return the same snapshot as get_scan_status.',
    },
    {
        name: 'get_report_status',
        title: 'Get HTML report status',
        description: 'Check whether the Playwright HTML report exists, and return its local path when it does.',
    },
    {
        name: 'delete_report',
        title: 'Delete HTML report',
        description: 'Delete the Playwright HTML report from playwright-report/.',
    },
    {
        name: 'list_allure_reports',
        title: 'List Allure reports',
        description: 'List generated Allure reports and whether allure-results exist from the last scan.',
    },
    {
        name: 'create_allure_report',
        title: 'Create Allure report',
        description: 'Generate a timestamped Allure HTML report from allure-results/.',
    },
    {
        name: 'delete_allure_report',
        title: 'Delete Allure report',
        description: 'Delete one generated Allure report by id from list_allure_reports.',
    },
    {
        name: 'list_spreadsheets',
        title: 'List spreadsheets',
        description: 'List Excel violation files, including absolute paths on this machine.',
    },
    {
        name: 'combine_spreadsheets',
        title: 'Combine spreadsheets',
        description:
            'Merge per-page Excel files into a site-prefixed master-list (every row) and work-list (unique target plus failure summary).',
    },
    {
        name: 'delete_spreadsheets',
        title: 'Delete spreadsheets',
        description: 'Delete one or more .xlsx files from the spreadsheets folder.',
    },
    {
        name: 'list_sites',
        title: 'List sites',
        description: 'List configured sites, including site recon URL counts.',
    },
    {
        name: 'add_site',
        title: 'Add site',
        description: 'Add a site by URL, run site recon (sitemaps plus homepage links), and save the deduped URL list.',
    },
    {
        name: 'run_site_recon',
        title: 'Run site recon',
        description: 'Re-run site recon for one site id: sitemaps plus homepage links, then replace the scan URL list.',
    },
    {
        name: 'delete_site_slugs',
        title: 'Delete site slugs',
        description: 'Remove one or more page slugs from a site. Keep at least one slug.',
    },
];

export function createScannerMcpServer({ service } = {}) {
    const scanner = service ?? createScannerService();
    const server = new McpServer({
        name: 'ada-scanner',
        version: '1.0.0',
    });

    server.registerTool(
        'list_suites',
        {
            title: 'List suites',
            description: scannerTools[0].description,
            annotations: { readOnlyHint: true, openWorldHint: false },
        },
        async () => jsonResult(await scanner.listSuites())
    );

    server.registerTool(
        'start_scan',
        {
            title: 'Start scan',
            description: scannerTools[1].description,
            inputSchema: {
                id: z.string().describe('Suite id from list_suites, for example rivedge'),
            },
            annotations: { openWorldHint: false },
        },
        async ({ id }) => jsonResult(await scanner.startRun(id))
    );

    server.registerTool(
        'stop_scan',
        {
            title: 'Stop scan',
            description: scannerTools[2].description,
            annotations: { destructiveHint: true, openWorldHint: false },
        },
        async () => jsonResult(await scanner.stopRun())
    );

    server.registerTool(
        'get_scan_status',
        {
            title: 'Get scan status',
            description: scannerTools[3].description,
            annotations: { readOnlyHint: true, openWorldHint: false },
        },
        async () => jsonResult(await scanner.getCurrentRun())
    );

    server.registerTool(
        'wait_for_scan',
        {
            title: 'Wait for scan',
            description: scannerTools[4].description,
            inputSchema: {
                timeoutMs: z
                    .number()
                    .int()
                    .positive()
                    .optional()
                    .describe('Give up after this many milliseconds. Defaults to 10 minutes.'),
            },
            annotations: { openWorldHint: false },
        },
        async ({ timeoutMs }) => jsonResult(await scanner.waitForRun({ timeoutMs }))
    );

    server.registerTool(
        'get_report_status',
        {
            title: 'Get HTML report status',
            description: scannerTools[5].description,
            annotations: { readOnlyHint: true, openWorldHint: false },
        },
        async () => jsonResult(await scanner.getReportStatus())
    );

    server.registerTool(
        'delete_report',
        {
            title: 'Delete HTML report',
            description: scannerTools[6].description,
            annotations: { destructiveHint: true, openWorldHint: false },
        },
        async () => jsonResult(await scanner.deleteReport())
    );

    server.registerTool(
        'list_allure_reports',
        {
            title: 'List Allure reports',
            description: scannerTools[7].description,
            annotations: { readOnlyHint: true, openWorldHint: false },
        },
        async () => jsonResult(await scanner.listAllureReports())
    );

    server.registerTool(
        'create_allure_report',
        {
            title: 'Create Allure report',
            description: scannerTools[8].description,
            annotations: { openWorldHint: false },
        },
        async () => jsonResult(await scanner.createAllureReport())
    );

    server.registerTool(
        'delete_allure_report',
        {
            title: 'Delete Allure report',
            description: scannerTools[9].description,
            inputSchema: {
                id: z.string().describe('Allure report id from list_allure_reports'),
            },
            annotations: { destructiveHint: true, openWorldHint: false },
        },
        async ({ id }) => jsonResult(await scanner.deleteAllureReport(id))
    );

    server.registerTool(
        'list_spreadsheets',
        {
            title: 'List spreadsheets',
            description: scannerTools[10].description,
            annotations: { readOnlyHint: true, openWorldHint: false },
        },
        async () => jsonResult(await scanner.listSpreadsheets())
    );

    server.registerTool(
        'combine_spreadsheets',
        {
            title: 'Combine spreadsheets',
            description: scannerTools[11].description,
            annotations: { openWorldHint: false },
        },
        async () => jsonResult(await scanner.combineSpreadsheets())
    );

    server.registerTool(
        'delete_spreadsheets',
        {
            title: 'Delete spreadsheets',
            description: scannerTools[12].description,
            inputSchema: {
                names: z.array(z.string()).min(1).describe('Spreadsheet file names, for example home.xlsx'),
            },
            annotations: { destructiveHint: true, openWorldHint: false },
        },
        async ({ names }) => jsonResult(await scanner.deleteSpreadsheets(names))
    );

    server.registerTool(
        'list_sites',
        {
            title: 'List sites',
            description: scannerTools[13].description,
            annotations: { readOnlyHint: true, openWorldHint: false },
        },
        async () => jsonResult(await scanner.listSites())
    );

    server.registerTool(
        'add_site',
        {
            title: 'Add site',
            description: scannerTools[14].description,
            inputSchema: {
                url: z.string().describe('Site home URL, for example https://example.com'),
                label: z.string().optional().describe('Display name. Defaults to the hostname.'),
            },
            annotations: { openWorldHint: true },
        },
        async ({ url, label }) => jsonResult(await scanner.addSite({ url, label }))
    );

    server.registerTool(
        'run_site_recon',
        {
            title: 'Run site recon',
            description: scannerTools[15].description,
            inputSchema: {
                id: z.string().describe('Site id from list_sites'),
            },
            annotations: { openWorldHint: true },
        },
        async ({ id }) => jsonResult(await scanner.reconSite(id))
    );

    server.registerTool(
        'delete_site_slugs',
        {
            title: 'Delete site slugs',
            description: scannerTools[16].description,
            inputSchema: {
                id: z.string().describe('Site id from list_sites'),
                slugs: z.array(z.string()).min(1).describe('Slug paths to remove, empty string for home'),
            },
            annotations: { destructiveHint: true, openWorldHint: false },
        },
        async ({ id, slugs }) => jsonResult(await scanner.deleteSiteSlugs(id, slugs))
    );

    return server;
}

export async function resolveScannerBackend({
    url = process.env.ADA_SCANNER_URL || 'http://127.0.0.1:3847',
    inProcess = process.env.ADA_SCANNER_IN_PROCESS === '1',
    fetchImpl = fetch,
} = {}) {
    if (inProcess) {
        return { kind: 'in-process', service: createScannerService({ savedScansDb: defaultSavedScansDb }) };
    }
    const client = createScannerClient({ baseUrl: url, fetchImpl });
    try {
        const health = await client.getHealth();
        if (health.ok) {
            return { kind: 'http', service: client };
        }
    } catch {
        // Dashboard is not running; own the runner in this process.
    }
    return { kind: 'in-process', service: createScannerService({ savedScansDb: defaultSavedScansDb }) };
}

function jsonResult(result) {
    return {
        content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }],
        isError: !result.ok,
    };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
    const { service, kind } = await resolveScannerBackend();
    const server = createScannerMcpServer({ service });
    await server.connect(new StdioServerTransport());
    console.error(`ADA Scanner MCP (${kind})`);
}
