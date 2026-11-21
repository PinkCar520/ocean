import type { Token, Tokens } from 'marked';
import React, { useEffect, useState } from 'react';
import { useStdout } from 'ink';
import wrapAnsiNpm from 'wrap-ansi';
import type { CliHighlight } from '../../utils/cli-highlight.js';
import { Ansi } from './ansi.js';
import { formatToken, padAligned, stringWidth, stripAnsi } from './format.js';

// 与 restored-src/src/components/MarkdownTable.tsx 一致的 Ink flex/Box 表格实现：
// 计算列宽 → 单元内换行 → 边框对齐；列过窄时退化为竖排 key-value 展示。

/** 预留父级缩进（▸ 前缀等）与终端 resize 竞态的空间，避免 Ink 裁剪抖动 */
const SAFETY_MARGIN = 4;
const MIN_COLUMN_WIDTH = 3;
const MAX_ROW_LINES = 4;

const ANSI_BOLD_START = '\x1b[1m';
const ANSI_BOLD_END = '\x1b[22m';

type Props = {
  token: Tokens.Table;
  highlight: CliHighlight | null;
  /** 覆盖终端宽度（便于测试） */
  forceWidth?: number;
};

function useTerminalColumns(): number {
  const { stdout } = useStdout();
  const [columns, setColumns] = useState(stdout?.columns ?? 80);

  useEffect(() => {
    if (!stdout) return;
    const handleResize = () => setColumns(stdout.columns ?? 80);
    handleResize();
    stdout.on('resize', handleResize);
    return () => {
      stdout.off('resize', handleResize);
    };
  }, [stdout]);

  return columns;
}

function wrapText(text: string, width: number, options?: { hard?: boolean }): string[] {
  if (width <= 0) return [text];
  // formatToken 会给段落等 token 追加 EOL，先去掉，避免单元格多出空行
  const trimmedText = text.trimEnd();
  const wrapped = wrapAnsiNpm(trimmedText, width, {
    hard: options?.hard ?? false,
    trim: false,
    wordWrap: true,
  });
  const lines = wrapped.split('\n').filter((line) => line.length > 0);
  return lines.length > 0 ? lines : [''];
}

export function MarkdownTable({ token, highlight, forceWidth }: Props): React.ReactNode {
  const terminalWidth = forceWidth ?? useTerminalColumns();

  const formatCell = (tokens: Token[] | undefined): string =>
    (tokens ?? []).map((child) => formatToken(child, { highlight })).join('');

  const getPlainText = (tokens: Token[] | undefined): string => stripAnsi(formatCell(tokens));

  const getMinWidth = (tokens: Token[] | undefined): number => {
    const text = getPlainText(tokens);
    const words = text.split(/\s+/).filter((word) => word.length > 0);
    if (words.length === 0) return MIN_COLUMN_WIDTH;
    return Math.max(...words.map((word) => stringWidth(word)), MIN_COLUMN_WIDTH);
  };

  const getIdealWidth = (tokens: Token[] | undefined): number =>
    Math.max(stringWidth(getPlainText(tokens)), MIN_COLUMN_WIDTH);

  const minWidths = token.header.map((header, colIndex) => {
    let maxMinWidth = getMinWidth(header.tokens);
    for (const row of token.rows) {
      maxMinWidth = Math.max(maxMinWidth, getMinWidth(row[colIndex]?.tokens));
    }
    return maxMinWidth;
  });

  const idealWidths = token.header.map((header, colIndex) => {
    let maxIdeal = getIdealWidth(header.tokens);
    for (const row of token.rows) {
      maxIdeal = Math.max(maxIdeal, getIdealWidth(row[colIndex]?.tokens));
    }
    return maxIdeal;
  });

  const numCols = token.header.length;
  const borderOverhead = 1 + numCols * 3;
  const availableWidth = Math.max(
    terminalWidth - borderOverhead - SAFETY_MARGIN,
    numCols * MIN_COLUMN_WIDTH,
  );

  const totalMin = minWidths.reduce((sum, width) => sum + width, 0);
  const totalIdeal = idealWidths.reduce((sum, width) => sum + width, 0);

  let needsHardWrap = false;
  let columnWidths: number[];
  if (totalIdeal <= availableWidth) {
    columnWidths = idealWidths;
  } else if (totalMin <= availableWidth) {
    const extraSpace = availableWidth - totalMin;
    const overflows = idealWidths.map((ideal, index) => ideal - minWidths[index]!);
    const totalOverflow = overflows.reduce((sum, overflow) => sum + overflow, 0);
    columnWidths = minWidths.map((min, index) => {
      if (totalOverflow === 0) return min;
      return min + Math.floor((overflows[index]! / totalOverflow) * extraSpace);
    });
  } else {
    needsHardWrap = true;
    const scaleFactor = availableWidth / totalMin;
    columnWidths = minWidths.map((width) => Math.max(Math.floor(width * scaleFactor), MIN_COLUMN_WIDTH));
  }

  const calculateMaxRowLines = (): number => {
    let maxLines = 1;
    for (let index = 0; index < token.header.length; index++) {
      const wrapped = wrapText(formatCell(token.header[index]!.tokens), columnWidths[index]!, {
        hard: needsHardWrap,
      });
      maxLines = Math.max(maxLines, wrapped.length);
    }
    for (const row of token.rows) {
      for (let index = 0; index < row.length; index++) {
        const wrapped = wrapText(formatCell(row[index]?.tokens), columnWidths[index]!, {
          hard: needsHardWrap,
        });
        maxLines = Math.max(maxLines, wrapped.length);
      }
    }
    return maxLines;
  };

  const useVerticalFormat = calculateMaxRowLines() > MAX_ROW_LINES;

  const renderRowLines = (cells: Array<{ tokens?: Token[] }>, isHeader: boolean): string[] => {
    const cellLines = cells.map((cell, colIndex) =>
      wrapText(formatCell(cell.tokens), columnWidths[colIndex]!, { hard: needsHardWrap }),
    );
    const maxLines = Math.max(...cellLines.map((lines) => lines.length), 1);
    const verticalOffsets = cellLines.map((lines) => Math.floor((maxLines - lines.length) / 2));

    const result: string[] = [];
    for (let lineIdx = 0; lineIdx < maxLines; lineIdx++) {
      let line = '│';
      for (let colIndex = 0; colIndex < cells.length; colIndex++) {
        const lines = cellLines[colIndex]!;
        const contentLineIdx = lineIdx - verticalOffsets[colIndex]!;
        const lineText = contentLineIdx >= 0 && contentLineIdx < lines.length ? lines[contentLineIdx]! : '';
        const align = isHeader ? 'center' : token.align?.[colIndex] ?? 'left';
        line += ' ' + padAligned(lineText, stringWidth(lineText), columnWidths[colIndex]!, align) + ' │';
      }
      result.push(line);
    }
    return result;
  };

  const renderBorderLine = (type: 'top' | 'middle' | 'bottom'): string => {
    const [left, mid, cross, right] = {
      top: ['┌', '─', '┬', '┐'],
      middle: ['├', '─', '┼', '┤'],
      bottom: ['└', '─', '┴', '┘'],
    }[type];
    let line = left;
    columnWidths.forEach((width, colIndex) => {
      line += mid.repeat(width + 2);
      line += colIndex < columnWidths.length - 1 ? cross : right;
    });
    return line;
  };

  const renderVerticalFormat = (): string => {
    const lines: string[] = [];
    const headers = token.header.map((header) => getPlainText(header.tokens));
    const separatorWidth = Math.min(terminalWidth - 1, 40);
    const separator = '─'.repeat(Math.max(separatorWidth, 1));
    const wrapIndent = '  ';

    token.rows.forEach((row, rowIndex) => {
      if (rowIndex > 0) lines.push(separator);
      row.forEach((cell, colIndex) => {
        const label = headers[colIndex] || `Column ${colIndex + 1}`;
        const rawValue = formatCell(cell.tokens).trimEnd();
        const value = rawValue.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();

        const firstLineWidth = terminalWidth - stringWidth(label) - 3;
        const subsequentLineWidth = terminalWidth - wrapIndent.length - 1;

        const firstPassLines = wrapText(value, Math.max(firstLineWidth, 10));
        const firstLine = firstPassLines[0] || '';
        let wrappedValue: string[];
        if (firstPassLines.length <= 1 || subsequentLineWidth <= firstLineWidth) {
          wrappedValue = firstPassLines;
        } else {
          const remainingText = firstPassLines.slice(1).map((line) => line.trim()).join(' ');
          wrappedValue = [firstLine, ...wrapText(remainingText, subsequentLineWidth)];
        }

        lines.push(`${ANSI_BOLD_START}${label}:${ANSI_BOLD_END} ${wrappedValue[0] || ''}`);
        for (let index = 1; index < wrappedValue.length; index++) {
          const line = wrappedValue[index]!;
          if (!line.trim()) continue;
          lines.push(`${wrapIndent}${line}`);
        }
      });
    });

    return lines.join('\n');
  };

  if (useVerticalFormat) return <Ansi>{renderVerticalFormat()}</Ansi>;

  const tableLines: string[] = [];
  tableLines.push(renderBorderLine('top'));
  tableLines.push(...renderRowLines(token.header, true));
  tableLines.push(renderBorderLine('middle'));
  token.rows.forEach((row, rowIndex) => {
    tableLines.push(...renderRowLines(row, false));
    if (rowIndex < token.rows.length - 1) tableLines.push(renderBorderLine('middle'));
  });
  tableLines.push(renderBorderLine('bottom'));

  const maxLineWidth = Math.max(...tableLines.map((line) => stringWidth(line)));
  if (maxLineWidth > terminalWidth - SAFETY_MARGIN) return <Ansi>{renderVerticalFormat()}</Ansi>;

  return <Ansi>{tableLines.join('\n')}</Ansi>;
}
