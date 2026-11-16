import type { FileHandle } from 'node:fs/promises';

/** Read an explicit line range without allocating memory proportional to file size. */
export async function readLargeTextRange(handle: FileHandle, start: number, limit: number, maxChars: number, signal?: AbortSignal) {
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const buffer = Buffer.alloc(64 * 1024);
  const lines: string[] = [];
  let position = 0;
  let currentLine = 0;
  let selected = '';
  let selectedChars = 0;

  const result = (totalLines: number | null, partialLine = false) => ({
    content: lines.join('\n'),
    offset: start,
    linesRead: lines.length,
    totalLines,
    truncated: start > 0 || totalLines === null || start + lines.length < totalLines || partialLine,
    ...(partialLine ? { partialLine: true } : {}),
  });

  const addFragment = (fragment: string): boolean => {
    if (currentLine < start) return false;
    const remaining = maxChars - selectedChars - (lines.length ? 1 : 0);
    const combined = selected + fragment;
    // Keep a CR just beyond the cap until its line ending is known.
    if (combined.length <= remaining || (combined.length === remaining + 1 && combined.endsWith('\r'))) {
      selected = combined;
      return false;
    }
    if (remaining < 0) return true;
    let prefix = combined.slice(0, remaining);
    // Do not return a dangling UTF-16 surrogate when truncating an emoji.
    if (prefix.length && /[\uD800-\uDBFF]/.test(prefix[prefix.length - 1])) prefix = prefix.slice(0, -1);
    lines.push(prefix);
    return true;
  };

  const finishLine = () => {
    if (currentLine >= start) {
      if (selected.endsWith('\r')) selected = selected.slice(0, -1);
      selectedChars += selected.length + (lines.length ? 1 : 0);
      lines.push(selected);
      selected = '';
    }
    currentLine++;
  };

  for (;;) {
    signal?.throwIfAborted();
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, position);
    position += bytesRead;
    const bytes = buffer.subarray(0, bytesRead);
    if (bytes.includes(0)) throw new Error('Binary files cannot be read as text.');
    let text: string;
    try {
      text = decoder.decode(bytes, { stream: bytesRead > 0 });
    } catch {
      throw new Error('File is not valid UTF-8 text.');
    }
    let cursor = 0;
    for (;;) {
      const newline = text.indexOf('\n', cursor);
      if (newline < 0) break;
      if (addFragment(text.slice(cursor, newline))) return result(null, true);
      finishLine();
      cursor = newline + 1;
      if (lines.length >= limit) return result(null);
    }
    if (addFragment(text.slice(cursor))) return result(null, true);
    if (bytesRead === 0) {
      finishLine();
      return result(currentLine);
    }
  }
}
