import { imageMediaType } from './image-formats.js';

type NotebookPart = { type: 'text'; text: string } | { type: 'image'; mediaType: string; base64: string };

const textValue = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && value.every(item => typeof item === 'string')) return value.join('');
  return '';
};

/** Convert notebook cells and outputs into ordered text and image parts. */
export function readNotebook(raw: string, maxChars: number) {
  let notebook: any;
  try { notebook = JSON.parse(raw); } catch { throw new Error('Notebook is not valid JSON.'); }
  if (!notebook || !Array.isArray(notebook.cells)) throw new Error('Notebook must contain a cells array.');
  const language = typeof notebook.metadata?.language_info?.name === 'string' ? notebook.metadata.language_info.name : 'python';
  const parts: NotebookPart[] = [];
  let characters = 0;
  let truncated = false;
  const addText = (value: string) => {
    const remaining = Math.max(0, maxChars - characters);
    let text = value.slice(0, remaining);
    if (text.length < value.length) {
      truncated = true;
      if (text.length && /[\uD800-\uDBFF]/.test(text[text.length - 1])) text = text.slice(0, -1);
    }
    characters += text.length;
    if (text) parts.push({ type: 'text', text });
  };
  for (const [index, cell] of notebook.cells.entries()) {
    if (!cell || typeof cell !== 'object' || typeof cell.cell_type !== 'string') throw new Error(`Invalid notebook cell at index ${index}.`);
    const id = typeof cell.id === 'string' ? cell.id : `cell-${index}`;
    const label = JSON.stringify({ id, type: cell.cell_type, ...(cell.cell_type === 'code' ? { language, executionCount: cell.execution_count ?? null } : {}) });
    addText(`Cell ${label}\n${textValue(cell.source)}\n`);
    if (!Array.isArray(cell.outputs)) continue;
    for (const output of cell.outputs) {
      if (!output || typeof output !== 'object') continue;
      const type = typeof output.output_type === 'string' ? output.output_type : 'output';
      let content = textValue(output.text);
      if (type === 'error') content = [output.ename, output.evalue, ...(Array.isArray(output.traceback) ? output.traceback : [])].filter(value => typeof value === 'string').join('\n');
      if (output.data && typeof output.data === 'object') content ||= textValue(output.data['text/plain']);
      if (content) addText(`Output (${type}):\n${content}\n`);
      for (const mediaType of ['image/png', 'image/jpeg']) {
        const encoded = textValue(output.data?.[mediaType]).replace(/\s/g, '');
        if (!encoded || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) continue;
        if (imageMediaType(Buffer.from(encoded, 'base64')) !== mediaType) continue;
        parts.push({ type: 'image', mediaType, base64: encoded });
        break;
      }
    }
  }
  if (truncated) parts.push({ type: 'text', text: '\n[Notebook text truncated.]' });
  return { kind: 'notebook' as const, cellCount: notebook.cells.length, language, parts, truncated };
}
