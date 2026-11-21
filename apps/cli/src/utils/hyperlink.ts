import chalk from 'chalk';
import { supportsHyperlinks } from './supports-hyperlinks.js';

// OSC 8 超链接：\e]8;;URL\e\\TEXT\e]8;;\e\\（这里用 BEL 结尾，兼容性更广）
export const OSC8_START = '\x1b]8;;';
export const OSC8_END = '\x07';

export function createHyperlink(
  url: string,
  content?: string,
  options?: { supportsHyperlinks?: boolean },
): string {
  const hasSupport = options?.supportsHyperlinks ?? supportsHyperlinks();
  if (!hasSupport) return url;

  const displayText = content ?? url;
  return `${OSC8_START}${url}${OSC8_END}${chalk.blue(displayText)}${OSC8_START}${OSC8_END}`;
}
