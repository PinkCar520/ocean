type ListMcpToolPage<T> = (cursor?: string) => Promise<{ tools: T[]; nextCursor?: string }>;

/** Iterate an MCP tool catalog whose cursor is opaque to the caller. */
export async function* mcpToolPages<T>(listPage: ListMcpToolPage<T>): AsyncGenerator<T[]> {
  const seen = new Set<string>();
  let cursor: string | undefined;
  for (let page = 0; page < 64; page++) {
    const result = await listPage(cursor);
    yield result.tools;
    cursor = result.nextCursor;
    if (cursor === undefined) return;
    if (seen.has(cursor)) throw new Error('MCP server repeated a tool catalog cursor.');
    seen.add(cursor);
  }
  throw new Error('MCP tool catalog exceeded the page limit.');
}

export async function collectMcpTools<T>(listPage: ListMcpToolPage<T>): Promise<T[]> {
  const tools: T[] = [];
  for await (const page of mcpToolPages(listPage)) {
    for (const tool of page) tools.push(tool);
  }
  return tools;
}
