import chalk from 'chalk';
import { marked, type Token, type Tokens } from 'marked';
import type { CliHighlight } from '../../utils/cli-highlight.js';
import { createHyperlink } from '../../utils/hyperlink.js';

// 与 restored-src/src/utils/markdown.ts 保持同一套 token → ANSI 逻辑。
const EOL = '\n';
export const BLOCKQUOTE_BAR = '▏';

let markedConfigured = false;

export function configureMarked(): void {
  if (markedConfigured) return;
  markedConfigured = true;
  // 关闭 ~ 删除线解析：模型常用 ~ 表示“约等于”（如 ~100），极少真要删除线。
  marked.use({ tokenizer: { del: () => undefined } } as unknown as Parameters<typeof marked.use>[0]);
}

export interface FormatContext {
  highlight?: CliHighlight | null;
  listDepth?: number;
  orderedListNumber?: number | null;
  parent?: Token | null;
}

export function applyMarkdown(content: string, highlight: CliHighlight | null = null): string {
  configureMarked();
  return marked
    .lexer(content)
    .map((token) => formatToken(token, { highlight }))
    .join('')
    .trim();
}

export function formatToken(token: Token, ctx: FormatContext = {}): string {
  const { highlight = null, listDepth = 0, orderedListNumber = null, parent = null } = ctx;

  switch (token.type) {
    case 'blockquote': {
      const inner = (token.tokens ?? []).map((child) => formatToken(child, { highlight })).join('');
      const bar = chalk.dim(BLOCKQUOTE_BAR);
      // 保持正文正常亮度，仅竖线弱化；chalk.dim 在深色主题上几乎不可见。
      return inner
        .split(EOL)
        .map((line) => (stripAnsi(line).trim() ? `${bar} ${chalk.italic(line)}` : line))
        .join(EOL);
    }
    case 'code': {
      if (!highlight) return token.text + EOL;
      let language = 'plaintext';
      if (token.lang && highlight.supportsLanguage(token.lang)) language = token.lang;
      return highlight.highlight(token.text, { language }) + EOL;
    }
    case 'codespan':
      // 行内代码
      return chalk.cyan(token.text);
    case 'em':
      return chalk.italic((token.tokens ?? []).map((child) => formatToken(child, { highlight, parent })).join(''));
    case 'strong':
      return chalk.bold((token.tokens ?? []).map((child) => formatToken(child, { highlight, parent })).join(''));
    case 'heading':
      switch (token.depth) {
        case 1:
          return chalk.bold.italic.underline((token.tokens ?? []).map((child) => formatToken(child, { highlight })).join('')) + EOL + EOL;
        default:
          return chalk.bold((token.tokens ?? []).map((child) => formatToken(child, { highlight })).join('')) + EOL + EOL;
      }
    case 'hr':
      return '---';
    case 'image':
      return token.href;
    case 'link': {
      // mailto 链接不展示为可点击链接，直接显示邮箱
      if (token.href.startsWith('mailto:')) return token.href.replace(/^mailto:/, '');

      const linkText = (token.tokens ?? [])
        .map((child) => formatToken(child, { highlight, parent: token }))
        .join('');
      const plainLinkText = stripAnsi(linkText);
      if (plainLinkText && plainLinkText !== token.href) return createHyperlink(token.href, linkText);
      return createHyperlink(token.href);
    }
    case 'list':
      return token.items
        .map((item: Token, index: number) =>
          formatToken(item, {
            highlight,
            listDepth,
            orderedListNumber: token.ordered ? token.start + index : null,
            parent: token,
          }),
        )
        .join('');
    case 'list_item':
      return (token.tokens ?? [])
        .map(
          (child) =>
            `${'  '.repeat(listDepth)}${formatToken(child, {
              highlight,
              listDepth: listDepth + 1,
              orderedListNumber,
              parent: token,
            })}`,
        )
        .join('');
    case 'paragraph':
      return (token.tokens ?? []).map((child) => formatToken(child, { highlight })).join('') + EOL;
    case 'space':
    case 'br':
      return EOL;
    case 'text':
      if (parent?.type === 'link') return token.text;
      if (parent?.type === 'list_item') {
        const bullet = orderedListNumber === null ? '-' : `${getListNumber(listDepth, orderedListNumber)}.`;
        const body = token.tokens
          ? token.tokens
              .map((child) => formatToken(child, { highlight, listDepth, orderedListNumber, parent: token }))
              .join('')
          : token.text;
        return `${bullet} ${body}${EOL}`;
      }
      return token.text;
    case 'table':
      return formatTable(token as Tokens.Table, highlight);
    case 'escape':
      return token.text;
    default:
      // def / del / html 等不做渲染
      return '';
  }
}

function formatTable(tableToken: Tokens.Table, highlight: CliHighlight | null): string {
  const getDisplayText = (tokens: Token[] | undefined): string =>
    stripAnsi((tokens ?? []).map((child) => formatToken(child, { highlight })).join(''));

  const columnWidths = tableToken.header.map((header, index) => {
    let maxWidth = stringWidth(getDisplayText(header.tokens));
    for (const row of tableToken.rows) {
      maxWidth = Math.max(maxWidth, stringWidth(getDisplayText(row[index]?.tokens)));
    }
    return Math.max(maxWidth, 3);
  });

  let output = '| ';
  tableToken.header.forEach((header, index) => {
    const content = (header.tokens ?? []).map((child) => formatToken(child, { highlight })).join('');
    const width = columnWidths[index]!;
    output += padAligned(content, stringWidth(getDisplayText(header.tokens)), width, tableToken.align?.[index]) + ' | ';
  });
  output = output.trimEnd() + EOL;

  output += '|';
  columnWidths.forEach((width) => {
    output += '-'.repeat(width + 2) + '|';
  });
  output += EOL;

  tableToken.rows.forEach((row) => {
    output += '| ';
    row.forEach((cell, index) => {
      const content = (cell.tokens ?? []).map((child) => formatToken(child, { highlight })).join('');
      const width = columnWidths[index]!;
      output += padAligned(content, stringWidth(getDisplayText(cell.tokens)), width, tableToken.align?.[index]) + ' | ';
    });
    output = output.trimEnd() + EOL;
  });

  return output + EOL;
}

function numberToLetter(n: number): string {
  let result = '';
  let value = n;
  while (value > 0) {
    value--;
    result = String.fromCharCode(97 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

const ROMAN_VALUES: ReadonlyArray<[number, string]> = [
  [1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'],
  [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i'],
];

function numberToRoman(n: number): string {
  let result = '';
  let value = n;
  for (const [amount, numeral] of ROMAN_VALUES) {
    while (value >= amount) {
      result += numeral;
      value -= amount;
    }
  }
  return result;
}

function getListNumber(listDepth: number, orderedListNumber: number): string {
  switch (listDepth) {
    case 0:
    case 1:
      return orderedListNumber.toString();
    case 2:
      return numberToLetter(orderedListNumber);
    case 3:
      return numberToRoman(orderedListNumber);
    default:
      return orderedListNumber.toString();
  }
}

export function padAligned(
  content: string,
  displayWidth: number,
  targetWidth: number,
  align: 'left' | 'center' | 'right' | null | undefined,
): string {
  const padding = Math.max(0, targetWidth - displayWidth);
  if (align === 'center') {
    const leftPad = Math.floor(padding / 2);
    return ' '.repeat(leftPad) + content + ' '.repeat(padding - leftPad);
  }
  if (align === 'right') return ' '.repeat(padding) + content;
  return content + ' '.repeat(padding);
}

export function stripAnsi(input: string): string {
  return input
    .replace(/\x1b\]8;;[^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b\[[0-9;]*m/g, '');
}

const SEGMENTER = typeof Intl !== 'undefined' && 'Segmenter' in Intl
  ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  : null;

function isWide(codePoint: number): boolean {
  return codePoint >= 0x1100 && (
    codePoint <= 0x115f
    || codePoint === 0x2329
    || codePoint === 0x232a
    || (codePoint >= 0x2e80 && codePoint <= 0xa4cf && codePoint !== 0x303f)
    || (codePoint >= 0xac00 && codePoint <= 0xd7a3)
    || (codePoint >= 0xf900 && codePoint <= 0xfaff)
    || (codePoint >= 0xfe10 && codePoint <= 0xfe19)
    || (codePoint >= 0xfe30 && codePoint <= 0xfe6f)
    || (codePoint >= 0xff00 && codePoint <= 0xff60)
    || (codePoint >= 0xffe0 && codePoint <= 0xffe6)
    || (codePoint >= 0x1f300 && codePoint <= 0x1f64f)
    || (codePoint >= 0x1f900 && codePoint <= 0x1f9ff)
    || (codePoint >= 0x20000 && codePoint <= 0x3fffd)
  );
}

/** 终端显示宽度（CJK 字符计 2 列），自动忽略 ANSI/OSC 8 序列。 */
export function stringWidth(input: string): number {
  const text = input.includes('\x1b') ? stripAnsi(input) : input;
  let width = 0;
  if (!SEGMENTER) return text.length;
  for (const { segment } of SEGMENTER.segment(text)) {
    const codePoint = segment.codePointAt(0) ?? 0;
    if (codePoint === 0x200d || (codePoint >= 0x300 && codePoint <= 0x36f)) continue;
    width += isWide(codePoint) ? 2 : 1;
  }
  return width;
}
