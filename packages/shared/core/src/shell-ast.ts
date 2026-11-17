import parse from 'bash-parser';
export type ShellNode = { type: 'command'; words: string[] } | { type: 'unsupported'; reason: string };

/** Parse actual Bash syntax; only literal simple commands can be auto-allowed. */
export function parseShellCommand(source: string): ShellNode {
  if (source.length > 8192 || /[\0\r\n]/.test(source)) return { type: 'unsupported', reason: 'size or control character' };
  try {
    const script = parse(source);
    if (script.type !== 'Script' || script.commands?.length !== 1) return { type: 'unsupported', reason: 'compound command' };
    const command = script.commands[0];
    if (command.type !== 'Command' || command.async || command.prefix?.length || !command.name) return { type: 'unsupported', reason: 'nonliteral command' };
    const nodes = [command.name, ...(command.suffix ?? [])];
    if (nodes.some(node => node.type !== 'Word' || node.expansion?.length || typeof node.text !== 'string' || /[*?\[\]~]/.test(node.text))) {
      return { type: 'unsupported', reason: 'redirect or expansion' };
    }
    return { type: 'command', words: nodes.map(node => node.text) };
  } catch { return { type: 'unsupported', reason: 'unsupported Bash syntax' }; }
}
