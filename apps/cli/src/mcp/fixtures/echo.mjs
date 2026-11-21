import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const changesCatalog = process.argv.includes('--changes-catalog');
let name = 'echo';
const server = new Server({ name: 'test-echo', version: '1' }, {
  capabilities: { tools: changesCatalog ? { listChanged: true } : {} },
});
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [{ name, inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } }],
}));
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (changesCatalog && name === 'echo') {
    name = 'echo_updated';
    await server.sendToolListChanged();
  }
  return { content: [{ type: 'text', text: request.params.arguments.text }] };
});
await server.connect(new StdioServerTransport());
