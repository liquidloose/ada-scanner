import { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { createScannerMcpServer } from './mcp.js';

export function createMcpHttpHandler(service) {
    const sessions = new Map();

    async function handle(req, res, parsedBody) {
        const sessionId = req.headers['mcp-session-id'];
        if (typeof sessionId === 'string' && sessions.has(sessionId)) {
            await sessions.get(sessionId).transport.handleRequest(req, res, parsedBody);
            return;
        }

        if (req.method === 'POST' && parsedBody && isInitializeRequest(parsedBody)) {
            const holder = { server: null, transport: null };
            const transport = new StreamableHTTPServerTransport({
                sessionIdGenerator: () => randomUUID(),
                onsessioninitialized: (id) => {
                    sessions.set(id, holder);
                },
            });
            holder.transport = transport;
            holder.server = createScannerMcpServer({ service });
            transport.onclose = () => {
                const id = transport.sessionId;
                if (id) {
                    sessions.delete(id);
                }
            };
            await holder.server.connect(transport);
            await transport.handleRequest(req, res, parsedBody);
            return;
        }

        res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
        res.end(
            JSON.stringify({
                jsonrpc: '2.0',
                error: { code: -32000, message: 'Bad Request: No valid session ID provided' },
                id: null,
            })
        );
    }

    return {
        handle,
        async close() {
            await Promise.all([...sessions.values()].map(({ transport }) => transport.close()));
            sessions.clear();
        },
    };
}
