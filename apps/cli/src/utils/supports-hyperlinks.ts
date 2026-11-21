import supportsHyperlinksLib from 'supports-hyperlinks';

// 与 restored-src/src/ink/supports-hyperlinks.ts 一致：
// 在 supports-hyperlinks 之外补充常见终端（含 tmux 中被覆盖的 LC_TERMINAL 场景）。
const ADDITIONAL_HYPERLINK_TERMINALS = [
  'ghostty',
  'Hyper',
  'kitty',
  'alacritty',
  'iTerm.app',
  'iTerm2',
];

type EnvLike = Record<string, string | undefined>;

export function supportsHyperlinks(options?: { env?: EnvLike; stdoutSupported?: boolean }): boolean {
  const stdoutSupported = options?.stdoutSupported ?? supportsHyperlinksLib.stdout;
  if (stdoutSupported) return true;

  const env = options?.env ?? process.env;
  const termProgram = env.TERM_PROGRAM;
  if (termProgram && ADDITIONAL_HYPERLINK_TERMINALS.includes(termProgram)) return true;

  const lcTerminal = env.LC_TERMINAL;
  if (lcTerminal && ADDITIONAL_HYPERLINK_TERMINALS.includes(lcTerminal)) return true;

  const term = env.TERM;
  if (term?.includes('kitty')) return true;

  return false;
}
