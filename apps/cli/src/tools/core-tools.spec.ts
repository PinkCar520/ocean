import { mkdir, mkdtemp, rm, truncate, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createFileReadTool } from './core-tools.js';
import { toAgentToolSet } from './index.js';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText, stepCountIs, wrapLanguageModel } from 'ai';
import { chatImageMiddleware } from '../llm/chat-image-middleware.js';
import { applyApprovalGate } from '../llm/chat.js';

describe('CLI file_read tool', () => {
  let tempRoot = '';

  afterEach(async () => {
    if (tempRoot) await rm(tempRoot, { recursive: true, force: true });
    tempRoot = '';
  });

  async function createWorkspace(): Promise<string> {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), 'ocean-file-read-'));
    const workspace = path.join(tempRoot, 'workspace');
    await mkdir(workspace);
    return workspace;
  }

  it('reads a bounded 0-based line range and reports omitted lines', async () => {
    const workspace = await createWorkspace();
    await writeFile(path.join(workspace, 'notes.txt'), 'first\r\nsecond\r\nthird', 'utf8');
    const result = await createFileReadTool().execute(
      { path: 'notes.txt', offset: 1, limit: 1 },
      { cwd: workspace, userId: 'tester', sessionId: 'read-test' },
    );

    expect(result).toMatchObject({
      data: { content: 'second', offset: 1, linesRead: 1, totalLines: 3, truncated: true },
    });
  });

  it('rejects binary data, invalid UTF-8, oversized files, and directories', async () => {
    const workspace = await createWorkspace();
    const tool = createFileReadTool();
    const context = { cwd: workspace, userId: 'tester', sessionId: 'read-test' };
    await writeFile(path.join(workspace, 'binary.bin'), Buffer.from([0x61, 0x00, 0x62]));
    await writeFile(path.join(workspace, 'invalid.txt'), Buffer.from([0xc3, 0x28]));
    const oversizedPath = path.join(workspace, 'large.txt');
    await writeFile(oversizedPath, '');
    await truncate(oversizedPath, 2 * 1024 * 1024 + 1);
    await mkdir(path.join(workspace, 'directory'));

    await expect(tool.execute({ path: 'binary.bin' }, context)).resolves.toMatchObject({ error: 'Binary files cannot be read as text.' });
    await expect(tool.execute({ path: 'invalid.txt' }, context)).resolves.toMatchObject({ error: 'File is not valid UTF-8 text.' });
    await expect(tool.execute({ path: 'large.txt' }, context)).resolves.toMatchObject({ error: expect.stringContaining('2 MB text read limit') });
    await expect(tool.execute({ path: 'directory' }, context)).resolves.toMatchObject({ error: 'Path is not a regular file.' });
  });

  it('caps returned characters and reports an empty range past EOF', async () => {
    const workspace = await createWorkspace();
    await writeFile(path.join(workspace, 'long.txt'), 'x'.repeat(100_001), 'utf8');
    await writeFile(path.join(workspace, 'short.txt'), 'one\ntwo', 'utf8');
    const tool = createFileReadTool();
    const context = { cwd: workspace, userId: 'tester', sessionId: 'read-test' };

    const capped = await tool.execute({ path: 'long.txt' }, context);
    expect(capped.data.content).toHaveLength(100_000);
    expect(capped.data.truncated).toBe(true);

    await expect(tool.execute({ path: 'short.txt', offset: 10, limit: 2 }, context)).resolves.toMatchObject({
      data: { content: '', offset: 10, linesRead: 0, totalLines: 2, truncated: true },
    });
  });

  it('reads requested ranges from large files with bounded output', async () => {
    const workspace = await createWorkspace();
    const file = path.join(workspace, 'large.txt');
    await writeFile(file, `${'skip\n'.repeat(500_000)}你好 🌊\r\nlast`);
    const context = { cwd: workspace, userId: 'tester', sessionId: 'read-test' };
    const tool = createFileReadTool();
    await expect(tool.execute({ path: 'large.txt', offset: 500_000, limit: 1 }, context)).resolves.toMatchObject({
      data: { content: '你好 🌊', linesRead: 1, totalLines: null, truncated: true },
    });
    await expect(tool.execute({ path: 'large.txt', offset: 500_001, limit: 2 }, context)).resolves.toMatchObject({
      data: { content: 'last', linesRead: 1, totalLines: 500_002, truncated: true },
    });
    await writeFile(file, `${'x'.repeat(2 * 1024 * 1024)}\nlast`);
    const capped = await tool.execute({ path: 'large.txt', limit: 1 }, context);
    expect(capped.data.content).toHaveLength(100_000);
    expect(capped.data).toMatchObject({ partialLine: true, linesRead: 1, totalLines: null, truncated: true });
    await expect(tool.execute({ path: 'large.txt', offset: 1, limit: 1 }, context)).resolves.toMatchObject({
      data: { content: 'last', linesRead: 1, totalLines: 2 },
    });
    await writeFile(file, `${'x'.repeat(100_000)}\r\n${'y'.repeat(2 * 1024 * 1024)}`);
    const exact = await tool.execute({ path: 'large.txt', limit: 1 }, context);
    expect(exact.data.content).toHaveLength(100_000);
    expect(exact.data.partialLine).toBeUndefined();
  });

  it('validates UTF-8 when scanning a large text range', async () => {
    const workspace = await createWorkspace();
    await writeFile(path.join(workspace, 'large.txt'), Buffer.concat([Buffer.from('x'.repeat(2 * 1024 * 1024)), Buffer.from([0xc3, 0x28])]));
    const result = await createFileReadTool().execute({ path: 'large.txt', offset: 1, limit: 1 }, { cwd: workspace, userId: 'tester', sessionId: 'read-test' });
    expect(result.error).toBe('File is not valid UTF-8 text.');
  });

  it('reads notebook cells, text outputs and images in order for the model', async () => {
    const workspace = await createWorkspace();
    const image = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/aV0AAAAASUVORK5CYII=';
    const notebook = { metadata: { language_info: { name: 'julia' } }, cells: [
      { cell_type: 'markdown', id: 'intro', source: ['# Title\n', 'Notes'] },
      { cell_type: 'code', id: 'compute', source: ['plot()'], execution_count: 2, outputs: [
        { output_type: 'stream', text: ['finished\n'] },
        { output_type: 'display_data', data: { 'text/plain': 'chart', 'image/png': image } },
        { output_type: 'error', ename: 'Error', evalue: 'failed', traceback: ['trace'] },
      ] },
    ] };
    await writeFile(path.join(workspace, 'analysis.ipynb'), JSON.stringify(notebook));
    const tools = await toAgentToolSet({ cwd: workspace, userId: 'tester', sessionId: 'read-test' });
    const result = await tools.file_read.execute({ path: 'analysis.ipynb' }, {});
    expect(result.data).toMatchObject({ kind: 'notebook', cellCount: 2, language: 'julia', truncated: false });
    const parts = tools.file_read.toModelOutput({ output: result }).value;
    expect(parts.map((part: any) => part.type)).toEqual(['text', 'text', 'text', 'text', 'file', 'text']);
    expect(parts[0].text).toContain('# Title\nNotes');
    expect(parts[2].text).toContain('finished');
    expect(parts[4]).toMatchObject({ mediaType: 'image/png', data: { type: 'data', data: image } });
    expect(parts[5].text).toContain('Error\nfailed\ntrace');
    await expect(tools.file_read.execute({ path: 'analysis.ipynb', limit: 1 }, {})).resolves.toMatchObject({ error: 'Line ranges cannot be used with notebooks.' });
    await writeFile(path.join(workspace, 'broken.ipynb'), '{oops');
    await expect(tools.file_read.execute({ path: 'broken.ipynb' }, {})).resolves.toMatchObject({ error: 'Notebook is not valid JSON.' });
  });

  it('bounds notebook text and omits invalid embedded images', async () => {
    const workspace = await createWorkspace();
    await writeFile(path.join(workspace, 'large.ipynb'), JSON.stringify({ cells: [
      { cell_type: 'code', source: 'x'.repeat(110_000), outputs: [{ output_type: 'display_data', data: { 'image/png': Buffer.from('not image').toString('base64') } }] },
    ] }));
    const result = await createFileReadTool().execute({ path: 'large.ipynb' }, { cwd: workspace, userId: 'tester', sessionId: 'read-test' });
    expect(result.data.truncated).toBe(true);
    expect(result.data.parts.every((part: any) => part.type === 'text')).toBe(true);
    expect(result.data.parts.map((part: any) => part.text).join('').length).toBeLessThan(100_100);
    await writeFile(path.join(workspace, 'empty.ipynb'), JSON.stringify({ cells: [] }));
    const tool = createFileReadTool();
    const empty = await tool.execute({ path: 'empty.ipynb' }, { cwd: workspace, userId: 'tester', sessionId: 'read-test' });
    expect(tool.toModelOutput({ output: empty })).toEqual({ type: 'text', value: 'Notebook contains no cells.' });
  });

  it('honors cancellation before opening a file', async () => {
    const workspace = await createWorkspace();
    const controller = new AbortController();
    controller.abort(new Error('cancelled by caller'));
    const result = await createFileReadTool().execute(
      { path: 'missing.txt' },
      { cwd: workspace, userId: 'tester', sessionId: 'read-test', signal: controller.signal },
    );

    expect(result.error).toBe('cancelled by caller');
  });

  it('forwards image bytes as a multimodal tool result through the agent adapter', async () => {
    const workspace = await createWorkspace();
    const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/aV0AAAAASUVORK5CYII=', 'base64');
    await writeFile(path.join(workspace, 'pixel.png'), image);
    const tools = await toAgentToolSet({ cwd: workspace, userId: 'tester', sessionId: 'read-test' });
    const result = await tools.file_read.execute({ path: 'pixel.png' }, {});
    expect(result.data).toMatchObject({ kind: 'image', mediaType: 'image/png', size: image.length });
    expect(tools.file_read.toModelOutput({ output: result })).toMatchObject({
      type: 'content',
      value: [{ type: 'text' }, { type: 'file', mediaType: 'image/png', data: { type: 'data', data: image.toString('base64') } }],
    });
    await expect(tools.file_read.execute({ path: 'pixel.png', offset: 0 }, {})).resolves.toMatchObject({ error: 'Line ranges cannot be used with images.' });
    await writeFile(path.join(workspace, 'fake.png'), 'not an image');
    await expect(tools.file_read.execute({ path: 'fake.png' }, {})).resolves.toMatchObject({ error: 'Unsupported or invalid image format.' });
  });

  it('carries a real image tool call into the next model request', async () => {
    const workspace = await createWorkspace();
    const base64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/aV0AAAAASUVORK5CYII=';
    await writeFile(path.join(workspace, 'pixel.png'), Buffer.from(base64, 'base64'));
    const requests: any[] = [];
    const model = wrapLanguageModel({ model: createOpenAI({ apiKey: 'test', fetch: async (_url, init) => {
      requests.push(JSON.parse(String(init?.body)));
      const message = requests.length === 1
        ? { role: 'assistant', tool_calls: [{ id: 'image-call', type: 'function', function: { name: 'file_read', arguments: '{"path":"pixel.png"}' } }] }
        : { role: 'assistant', content: 'Image received' };
      return new Response(JSON.stringify({ id: 'reply', model: 'test', choices: [{ index: 0, message, finish_reason: requests.length === 1 ? 'tool_calls' : 'stop' }] }), { headers: { 'content-type': 'application/json' } });
    } }).chat('test'), middleware: chatImageMiddleware });
    const tools = await toAgentToolSet({ cwd: workspace, userId: 'tester', sessionId: 'read-test' });
    await generateText({ model, prompt: 'Read pixel.png', tools: applyApprovalGate(tools), stopWhen: stepCountIs(2) });
    expect(requests).toHaveLength(2);
    expect(requests[1].messages.at(-1).content[1].image_url.url).toBe(`data:image/png;base64,${base64}`);
  });
});
