import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { createScannerClient } from './client.js';

export function createScannerMcpServer({ client = createScannerClient() } = {}) {
    const server = new McpServer({
        name: 'ada-scanner',
        version: '1.0.0',
    });

    server.registerTool(
        'list_suites',
        {
            title: 'List suites',
            description: 'List ADA Scanner site suites from GET /api/suites.',
        },
        async () => jsonResult(await client.listSuites())
    );

    server.registerTool(
        'start_scan',
        {
            title: 'Start scan',
            description: 'Start a suite via POST /api/runs. Poll get_scan_status until status is finished.',
            inputSchema: {
                id: z.string().describe('Suite id from list_suites, for example rivedge'),
            },
        },
        async ({ id }) => jsonResult(await client.startRun(id))
    );

    server.registerTool(
        'get_scan_status',
        {
            title: 'Get scan status',
            description: 'Poll GET /api/runs/current for logs, exit code, and report availability.',
        },
        async () => jsonResult(await client.getCurrentRun())
    );

    server.registerTool(
        'get_report_status',
        {
            title: 'Get HTML report status',
            description: 'Check whether the Playwright HTML report is available via GET /api/report.',
        },
        async () => jsonResult(await client.getReportStatus())
    );

    server.registerTool(
        'list_spreadsheets',
        {
            title: 'List spreadsheets',
            description: 'List Excel files from GET /api/spreadsheets, including local paths.',
        },
        async () => jsonResult(await client.listSpreadsheets())
    );

    server.registerTool(
        'delete_spreadsheets',
        {
            title: 'Delete spreadsheets',
            description: 'Delete one or more .xlsx files via POST /api/spreadsheets/delete.',
            inputSchema: {
                names: z.array(z.string()).min(1).describe('Spreadsheet file names, for example home.xlsx'),
            },
        },
        async ({ names }) => jsonResult(await client.deleteSpreadsheets(names))
    );

    return server;
}

function jsonResult(result) {
    return {
        content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }],
        isError: !result.ok,
    };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
    const server = createScannerMcpServer();
    await server.connect(new StdioServerTransport());
}
