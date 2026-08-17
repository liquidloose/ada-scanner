import { suites } from './suites.js';

const suiteIds = suites.map((suite) => suite.id);

const errorSchema = {
    type: 'object',
    required: ['ok', 'reason', 'message'],
    properties: {
        ok: { type: 'boolean', enum: [false] },
        reason: {
            type: 'string',
            enum: [
                'no-selection',
                'unknown',
                'busy',
                'timeout',
                'no-report',
                'no-spreadsheets',
                'missing',
                'invalid',
                'error',
            ],
        },
        message: { type: 'string' },
    },
};

const errorResponses = {
    400: { description: 'Invalid request', content: { 'application/json': { schema: errorSchema } } },
    403: { description: 'Rejected path or file type', content: { 'application/json': { schema: errorSchema } } },
    404: { description: 'Missing resource', content: { 'application/json': { schema: errorSchema } } },
    409: { description: 'A scan is already running', content: { 'application/json': { schema: errorSchema } } },
    500: { description: 'Unexpected server error', content: { 'application/json': { schema: errorSchema } } },
};

export function createOpenApiSpec({ port = 3847 } = {}) {
    return {
        openapi: '3.1.0',
        info: {
            title: 'ADA Scanner API',
            version: '1.0.0',
            summary: 'Run accessibility suites and manage scan artifacts',
            description:
                'HTTP API for the dashboard UI and scripts. The same scanner core is also exposed as MCP at POST /mcp. Start a scan with POST /api/runs, then poll GET /api/runs/current until status is finished. A scan with no Playwright output for 60s is stopped automatically. POST /api/runs/current/stop kills a scan immediately.',
            license: { name: 'ISC' },
        },
        servers: [{ url: `http://127.0.0.1:${port}`, description: 'Local dashboard' }],
        tags: [
            { name: 'Discovery', description: 'Find the API, MCP endpoint, and available suites' },
            { name: 'Runs', description: 'Start, poll, and stop accessibility scans' },
            { name: 'Reports', description: 'Playwright HTML report' },
            { name: 'Spreadsheets', description: 'Excel violation files' },
            { name: 'MCP', description: 'Model Context Protocol on the same process as the UI' },
        ],
        paths: {
            '/mcp': {
                post: {
                    operationId: 'mcp',
                    tags: ['MCP'],
                    summary: 'MCP Streamable HTTP',
                    description:
                        'Same tools as npm run dashboard:mcp: list_suites, start_scan, stop_scan, get_scan_status, wait_for_scan, get_report_status, delete_report, list_spreadsheets, combine_spreadsheets, delete_spreadsheets. Shares the Playwright runner with this dashboard.',
                    responses: {
                        200: { description: 'JSON-RPC response or SSE stream' },
                        400: { description: 'Missing MCP session' },
                    },
                },
                get: {
                    operationId: 'mcpSse',
                    tags: ['MCP'],
                    summary: 'MCP SSE stream',
                    responses: { 200: { description: 'Server-sent events for an existing MCP session' } },
                },
                delete: {
                    operationId: 'mcpClose',
                    tags: ['MCP'],
                    summary: 'Close an MCP session',
                    responses: { 200: { description: 'Session closed' } },
                },
            },
            '/api/health': {
                get: {
                    operationId: 'getHealth',
                    tags: ['Discovery'],
                    summary: 'Liveness check',
                    description: 'Used by the stdio MCP process to attach to this dashboard instead of starting a second runner.',
                    responses: {
                        200: {
                            description: 'Healthy',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        required: ['ok', 'name', 'mcp'],
                                        properties: {
                                            ok: { type: 'boolean' },
                                            name: { type: 'string' },
                                            mcp: { type: 'string', example: '/mcp' },
                                            ui: { type: 'string', example: '/' },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
            '/openapi.json': {
                get: {
                    operationId: 'getOpenApiSpec',
                    tags: ['Discovery'],
                    summary: 'OpenAPI document',
                    description: 'Machine-readable description of every ADA Scanner endpoint.',
                    responses: { 200: { description: 'OpenAPI 3.1 document' } },
                },
            },
            '/api': {
                get: {
                    operationId: 'getApiIndex',
                    tags: ['Discovery'],
                    summary: 'API catalog',
                    description: 'Lists operationIds and paths an agent can call.',
                    responses: {
                        200: {
                            description: 'Catalog of operations',
                            content: {
                                'application/json': {
                                    schema: { type: 'object', required: ['name', 'openapi', 'operations'] },
                                },
                            },
                        },
                    },
                },
            },
            '/api/suites': {
                get: {
                    operationId: 'listSuites',
                    tags: ['Discovery'],
                    summary: 'List site test suites',
                    description: 'Returns the test:* scripts from package.json.',
                    responses: {
                        200: {
                            description: 'Available suites',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        required: ['suites', 'busy'],
                                        properties: {
                                            busy: { type: 'boolean' },
                                            suites: {
                                                type: 'array',
                                                items: {
                                                    type: 'object',
                                                    required: ['id', 'script'],
                                                    properties: {
                                                        id: { type: 'string', enum: suiteIds, example: 'rivedge' },
                                                        script: { type: 'string', example: 'test:rivedge' },
                                                        label: { type: 'string' },
                                                    },
                                                },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
            '/api/runs': {
                post: {
                    operationId: 'startRun',
                    tags: ['Runs'],
                    summary: 'Start a scan',
                    description: 'Starts a suite and returns immediately. Poll GET /api/runs/current for logs and completion.',
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['id'],
                                    properties: {
                                        id: { type: 'string', enum: suiteIds, example: 'rivedge' },
                                    },
                                },
                            },
                        },
                    },
                    responses: {
                        202: {
                            description: 'Scan started',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        required: ['ok', 'id', 'status'],
                                        properties: {
                                            ok: { type: 'boolean' },
                                            id: { type: 'string' },
                                            status: { type: 'string', enum: ['running'] },
                                        },
                                    },
                                },
                            },
                        },
                        ...errorResponses,
                    },
                },
            },
            '/api/runs/current': {
                get: {
                    operationId: 'getCurrentRun',
                    tags: ['Runs'],
                    summary: 'Poll the current or last scan',
                    description: 'Returns idle, running, or finished state plus accumulated logs and whether an HTML report exists.',
                    responses: {
                        200: {
                            description: 'Current run snapshot',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        required: ['id', 'status', 'busy', 'logs', 'report'],
                                        properties: {
                                            id: { type: 'string', nullable: true, example: 'rivedge' },
                                            status: { type: 'string', enum: ['idle', 'running', 'finished'] },
                                            busy: { type: 'boolean' },
                                            code: { type: 'integer', nullable: true },
                                            logs: { type: 'string' },
                                            startedAt: { type: 'string', format: 'date-time', nullable: true },
                                            finishedAt: { type: 'string', format: 'date-time', nullable: true },
                                            stopped: { type: 'boolean' },
                                            hung: { type: 'boolean' },
                                            report: { type: 'boolean' },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
            '/api/runs/current/stop': {
                post: {
                    operationId: 'stopRun',
                    tags: ['Runs'],
                    summary: 'Stop the current scan',
                    description:
                        'Kills the running Playwright process tree, including hung scans, so a new suite can start.',
                    responses: {
                        200: {
                            description: 'Scan stopped, or no scan was running',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        required: ['ok', 'stopped', 'status', 'busy'],
                                        properties: {
                                            ok: { type: 'boolean' },
                                            stopped: { type: 'boolean' },
                                            id: { type: 'string', nullable: true },
                                            status: { type: 'string', enum: ['idle', 'running', 'finished'] },
                                            busy: { type: 'boolean' },
                                            logs: { type: 'string' },
                                            report: { type: 'boolean' },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
            '/api/run': {
                post: {
                    operationId: 'streamRun',
                    tags: ['Runs'],
                    summary: 'Start a scan and stream logs',
                    description: 'Same start as POST /api/runs, but the response is NDJSON until the process exits. Prefer startRun plus getCurrentRun for agents.',
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['id'],
                                    properties: { id: { type: 'string', enum: suiteIds, example: 'rivedge' } },
                                },
                            },
                        },
                    },
                    responses: {
                        200: { description: 'NDJSON stream of start, log, and done events' },
                        ...errorResponses,
                    },
                },
            },
            '/api/report': {
                get: {
                    operationId: 'getReportStatus',
                    tags: ['Reports'],
                    summary: 'Check HTML report availability',
                    responses: {
                        200: {
                            description: 'Report metadata',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        required: ['available', 'href', 'download'],
                                        properties: {
                                            available: { type: 'boolean' },
                                            href: { type: 'string', example: '/report/' },
                                            download: { type: 'string', example: '/api/report/download' },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
                delete: {
                    operationId: 'deleteReport',
                    tags: ['Reports'],
                    summary: 'Delete the HTML report',
                    description: 'Removes the Playwright HTML report directory contents. Rejected while a scan is running.',
                    responses: {
                        200: {
                            description: 'Report deleted',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        required: ['ok', 'available'],
                                        properties: {
                                            ok: { type: 'boolean' },
                                            available: { type: 'boolean', enum: [false] },
                                        },
                                    },
                                },
                            },
                        },
                        ...errorResponses,
                    },
                },
            },
            '/api/report/download': {
                get: {
                    operationId: 'downloadReport',
                    tags: ['Reports'],
                    summary: 'Download the themed HTML report',
                    responses: {
                        200: { description: 'playwright-report.html' },
                        404: errorResponses[404],
                    },
                },
            },
            '/api/spreadsheets': {
                get: {
                    operationId: 'listSpreadsheets',
                    tags: ['Spreadsheets'],
                    summary: 'List Excel reports',
                    responses: {
                        200: {
                            description: 'Spreadsheet files',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        required: ['files'],
                                        properties: {
                                            files: {
                                                type: 'array',
                                                items: {
                                                    type: 'object',
                                                    required: ['name', 'size', 'href'],
                                                    properties: {
                                                        name: { type: 'string', example: 'home.xlsx' },
                                                        size: { type: 'integer' },
                                                        mtime: { type: 'string', format: 'date-time' },
                                                        href: { type: 'string' },
                                                        path: { type: 'string', description: 'Absolute path on this machine' },
                                                    },
                                                },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
            '/api/spreadsheets/combine': {
                post: {
                    operationId: 'combineSpreadsheets',
                    tags: ['Spreadsheets'],
                    summary: 'Combine per-page Excel files',
                    description:
                        'Same as npm run combine-spreadsheets. Writes master-list.xlsx (every row) and work-list.xlsx (deduped by target and failure summary).',
                    responses: {
                        200: {
                            description: 'Combined files written',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        required: ['ok', 'sources', 'master', 'work'],
                                        properties: {
                                            ok: { type: 'boolean' },
                                            sources: { type: 'array', items: { type: 'string' } },
                                            master: {
                                                type: 'object',
                                                required: ['name', 'rows'],
                                                properties: {
                                                    name: { type: 'string', example: 'master-list.xlsx' },
                                                    rows: { type: 'integer' },
                                                    path: { type: 'string' },
                                                },
                                            },
                                            work: {
                                                type: 'object',
                                                required: ['name', 'rows'],
                                                properties: {
                                                    name: { type: 'string', example: 'work-list.xlsx' },
                                                    rows: { type: 'integer' },
                                                    path: { type: 'string' },
                                                },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                        ...errorResponses,
                    },
                },
            },
            '/api/spreadsheets/download': {
                post: {
                    operationId: 'downloadSpreadsheets',
                    tags: ['Spreadsheets'],
                    summary: 'Download selected spreadsheets',
                    description: 'One file returns that .xlsx. Several files return spreadsheets.zip.',
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['names'],
                                    properties: {
                                        names: {
                                            type: 'array',
                                            minItems: 1,
                                            items: { type: 'string', example: 'home.xlsx' },
                                        },
                                    },
                                },
                            },
                        },
                    },
                    responses: {
                        200: { description: 'xlsx or zip attachment' },
                        ...errorResponses,
                    },
                },
            },
            '/api/spreadsheets/delete': {
                post: {
                    operationId: 'deleteSpreadsheets',
                    tags: ['Spreadsheets'],
                    summary: 'Delete selected spreadsheets',
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['names'],
                                    properties: {
                                        names: {
                                            type: 'array',
                                            minItems: 1,
                                            items: { type: 'string', example: 'home.xlsx' },
                                        },
                                    },
                                },
                            },
                        },
                    },
                    responses: {
                        200: {
                            description: 'Deleted names',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        required: ['ok', 'deleted'],
                                        properties: {
                                            ok: { type: 'boolean' },
                                            deleted: { type: 'array', items: { type: 'string' } },
                                        },
                                    },
                                },
                            },
                        },
                        ...errorResponses,
                    },
                },
            },
            '/api/spreadsheets/{name}': {
                get: {
                    operationId: 'downloadSpreadsheet',
                    tags: ['Spreadsheets'],
                    summary: 'Download one spreadsheet',
                    parameters: [
                        {
                            name: 'name',
                            in: 'path',
                            required: true,
                            schema: { type: 'string', example: 'home.xlsx' },
                        },
                    ],
                    responses: {
                        200: { description: 'xlsx attachment' },
                        ...errorResponses,
                    },
                },
                delete: {
                    operationId: 'deleteSpreadsheet',
                    tags: ['Spreadsheets'],
                    summary: 'Delete one spreadsheet',
                    parameters: [
                        {
                            name: 'name',
                            in: 'path',
                            required: true,
                            schema: { type: 'string', example: 'home.xlsx' },
                        },
                    ],
                    responses: {
                        200: {
                            description: 'Deleted',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        required: ['ok', 'name'],
                                        properties: { ok: { type: 'boolean' }, name: { type: 'string' } },
                                    },
                                },
                            },
                        },
                        ...errorResponses,
                    },
                },
            },
        },
    };
}
