import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListResourceTemplatesRequestSchema, ReadResourceRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const server = new Server({ name: 'ocean-resource-fixture', version: '1' }, { capabilities: { resources: {} } });
server.setRequestHandler(ListResourceTemplatesRequestSchema, async ({ params }) => {
  if (params?.cursor === 'next') {
    return { resourceTemplates: [{ name: 'Archived documents', uriTemplate: 'fixture://archive/{id}' }] };
  }
  return { resourceTemplates: [{ name: 'Documents', uriTemplate: 'fixture://docs/{id}' }], nextCursor: 'next' };
});
server.setRequestHandler(ReadResourceRequestSchema, async ({ params }) => ({
  contents: [{ uri: params.uri, text: 'Fixture document' }],
}));
await server.connect(new StdioServerTransport());
