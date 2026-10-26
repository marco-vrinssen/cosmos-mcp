import { createMcpHandler } from '@modelcontextprotocol/server';

import { createServer } from './server.js';

const handler = createMcpHandler(() => createServer());

const INFO = 'cosmos-mcp: connect an MCP client to /mcp. Setup and source: https://github.com/marco-vrinssen/cosmos-mcp';

// Browser-based MCP clients, like the MCP Inspector, need CORS to reach the endpoint.
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
  'access-control-allow-headers': 'content-type, accept, authorization, mcp-session-id, mcp-protocol-version, last-event-id',
  'access-control-expose-headers': 'mcp-session-id, mcp-protocol-version',
};

function withCors(response) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(CORS)) headers.set(name, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

// A Cosmos login, when set, comes from Worker secrets through process.env, which nodejs_compat fills.
export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (pathname !== '/mcp') return new Response(INFO, { status: pathname === '/' ? 200 : 404 });

    // Each internet IP gets a fair share. Service-binding calls from the owner's Workers carry no client IP and skip it.
    const ip = request.headers.get('cf-connecting-ip');
    if (ip) {
      const { success } = await env.LIMITER.limit({ key: ip });
      if (!success) return withCors(new Response('Too many requests. Try again in a minute.', { status: 429, headers: { 'retry-after': '60' } }));
    }
    return withCors(await handler.fetch(request));
  },
};
