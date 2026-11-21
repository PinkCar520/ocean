import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Box, Text, useCursor, useStdout } from 'ink';
import wrapAnsiNpm from 'wrap-ansi';
import chalk from 'chalk';
import { useOceanInput } from '../hooks/useOceanInput.js';
import { resolveCommandEnter } from './command-enter.js';
import { stringWidth } from './markdown/format.js';

interface MessageInputProps {
  isWaiting: boolean;
  isThinking: boolean;
  onSubmit: (input: string) => void;
  history?: string[];
  /** 整个 Ink 帧的高度（由 App 通过 measureElement 传入），用于给输入法定位光标 */
  frameHeight?: number;
  /** 输入行之下、除输入框自带底部边框外的行数（如 Ctrl-C 提示） */
  rowsBelowInput?: number;
  /** When false, the input ignores keystrokes (e.g. while an approval prompt is active). */
  isActive?: boolean;
}

const COMMANDS = [
  { name: '/help', desc: 'Show available commands' },
  { name: '/login', desc: 'Sign in to Ocean Gateway' },
  { name: '/logout', desc: 'Remove local credentials' },
  { name: '/whoami', desc: 'Show current identity' },
  { name: '/clear', desc: 'Clear conversation history' },
  { name: '/new', desc: 'Start a new persistent session' },
  { name: '/sessions', desc: 'List saved sessions' },
  { name: '/resume', desc: 'Resume a saved session' },
  { name: '/tasks', desc: 'Show the current plan and task status' },
  { name: '/permissions', desc: 'Show or set the permission mode' },
  { name: '/model', desc: 'Switch or list models' },
  { name: '/skills', desc: 'List active skills' },
  { name: '/tools', desc: 'List built-in tools' },
  { name: '/mcp', desc: 'List MCP servers' },
  { name: '/exit', desc: 'Quit the application' },
];

export function MessageInput({
  isWaiting,
  isThinking,
  onSubmit,
  history = [],
  frameHeight = 0,
  rowsBelowInput = 0,
  isActive = true,
}: MessageInputProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [startIndex, setStartIndex] = useState(0);
  const MAX_VISIBLE = 5;
  const position = useRef<number | undefined>(undefined);
  const draft = useRef('');

  // 分隔线宽度必须小于终端总宽：写满整行会触发终端自动换行，
  // Ink 按估算行数回退光标时就会错位，表现为每次按键界面整体跳动。
  const { stdout } = useStdout();
  const readColumns = () => {
    const columns = stdout?.columns;
    return columns && columns > 0 ? columns : 80;
  };
  const [terminalColumns, setTerminalColumns] = useState(readColumns);
  useEffect(() => {
    if (!stdout) return;
    const handleResize = () => setTerminalColumns(readColumns());
    handleResize();
    stdout.on('resize', handleResize);
    return () => {
      stdout.off('resize', handleResize);
    };
  }, [stdout]);
  const rule = '─'.repeat(Math.max(1, terminalColumns - 1));
  // 输入内容区留 1 列余量（前缀 3 列），避免末行写满整行触发终端自动换行
  const inputWidth = Math.max(1, terminalColumns - 4);

  // Real filtered suggestions logic
  const getMatches = (val: string) => {
    if (!val.startsWith('/') || val.includes(' ')) return [];
    const search = val.toLowerCase();
    return COMMANDS.filter(cmd => cmd.name.toLowerCase().startsWith(search));
  };

  const updateScroll = (newIndex: number, totalMatches: number) => {
    setSelectedIndex(newIndex);
    
    // Sliding Window logic
    if (newIndex < startIndex) {
      setStartIndex(newIndex);
    } else if (newIndex >= startIndex + MAX_VISIBLE) {
      setStartIndex(newIndex - MAX_VISIBLE + 1);
    }
  };

  // 1. Core State & Logic using our Hook
  const { value, cursorOffset, setValue, setCursorOffset } = useOceanInput({
    isActive,
    onEnter: (val) => {
      if (!isWaiting) return true;
      const action = resolveCommandEnter(val, getMatches(val), selectedIndex);
      if (action.value.trim()) {
        position.current = undefined;
        draft.current = '';
        onSubmit(action.value);
      }
    },
    onTab: (val) => {
      const ms = getMatches(val);
      if (ms.length > 0) {
        const selected = ms[selectedIndex] || ms[0];
        return selected.name + ' ';
      }
      return val;
    },
    onUp: () => {
      const ms = getMatches(value);
      if (ms.length > 0) {
        const nextIndex = (selectedIndex > 0 ? selectedIndex - 1 : ms.length - 1);
        updateScroll(nextIndex, ms.length);
        return;
      }
      if (!history.length || !isWaiting) return;
      if (position.current === undefined) draft.current = value;
      position.current = Math.max(0, (position.current ?? history.length) - 1);
      const previous = history[position.current];
      setValue(previous);
      setCursorOffset(previous.length);
    },
    onDown: () => {
      const ms = getMatches(value);
      if (ms.length > 0) {
        const nextIndex = (selectedIndex < ms.length - 1 ? selectedIndex + 1 : 0);
        updateScroll(nextIndex, ms.length);
        return;
      }
      if (position.current === undefined || !isWaiting) return;
      const nextIndex = position.current + 1;
      position.current = nextIndex >= history.length ? undefined : nextIndex;
      const next = position.current === undefined ? draft.current : history[position.current];
      setValue(next);
      setCursorOffset(next.length);
    }
  });

  const activeMatches = useMemo(() => getMatches(value), [value]);

  // Reset selected index & scroll when search text changes
  useEffect(() => {
    setSelectedIndex(0);
    setStartIndex(0);
  }, [value]);

  // 2. Syntax Highlighting & Ghost Text Logic
  const renderedContent = useMemo(() => {
    const segments: React.ReactNode[] = [];
    const isCommand = value.startsWith('/');
    const firstSpace = value.indexOf(' ');
    const commandPart = firstSpace === -1 ? value : value.slice(0, firstSpace);

    // Placeholder logic - rendered only if value is empty
    if (!value && !isThinking) {
      return (
        <Text>
          <Text key="cursor-empty" backgroundColor="cyan" color="black">
            {' '}
          </Text>
          <Text key="placeholder" dimColor>
            {' Type your query or /help for commands'}
          </Text>
        </Text>
      );
    }

    if (!value && isThinking) {
      return <Text dimColor>⠋ Working...</Text>;
    }

    // Render logic for characters
    const fullText = value;
    for (let i = 0; i <= fullText.length; i++) {
      let char = fullText[i] || ' ';
      let color = (isCommand && i < commandPart.length) ? 'cyan' : 'white';

      const isCursor = i === cursorOffset;
      segments.push(
        <Text 
          key={i} 
          color={isCursor ? 'black' : color} 
          backgroundColor={isCursor ? 'cyan' : undefined}
        >
          {char}
        </Text>
      );
      if (i === fullText.length && !isCursor) break;
    }

    // Ghost Text Implementation - follow selected index
    if (isCommand && firstSpace === -1 && activeMatches[selectedIndex]) {
      const matchName = activeMatches[selectedIndex].name;
      if (matchName !== value) {
        segments.push(<Text key="ghost" color="gray" italic>{matchName.slice(value.length)}</Text>);
      }
    }

    // 必须在同一个 <Text> 内渲染，Ink 才会按终端宽度换行；并列的 Text 只会横向溢出
    return <Text>{segments}</Text>;
  }, [value, cursorOffset, isThinking, activeMatches, selectedIndex]);

  // 3. Input method (IME) support: place the real terminal cursor at the input cell
  // so the preedit text and candidate window appear inline instead of at the frame bottom.
  const { setCursorPosition } = useCursor();
  const suggestionRows = activeMatches.length > 0
    ? 1 + Math.min(MAX_VISIBLE, activeMatches.length - startIndex) + (activeMatches.length > MAX_VISIBLE ? 1 : 0)
    : 0;

  if (frameHeight > 0 && !isThinking) {
    const { line, col, totalLines } = locateCursor(value, cursorOffset, inputWidth);
    // 输入行之下：底部边框 + 候选列表 + 外部提示（如 Ctrl-C 提示）
    const rowsBelow = 1 + suggestionRows + rowsBelowInput;
    const lastInputLine = frameHeight - 1 - rowsBelow;
    const y = lastInputLine - (totalLines - 1) + line;
    setCursorPosition({ x: 3 + col, y: Math.max(0, y) });
  } else {
    setCursorPosition(undefined);
  }

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box>
        <Text color="gray">{rule}</Text>
      </Box>     
      <Box>
        <Box marginRight={1}>
          <Text bold color={isWaiting ? 'green' : 'gray'}>{'› '}</Text>
        </Box>
        <Box width={inputWidth}>{renderedContent}</Box>
      </Box>
      <Box>
        <Text color="gray">{rule}</Text>
      </Box>

      {/* Suggestions List - Interactive & Scrolling */}
      {activeMatches.length > 0 && (
        <Box flexDirection="column" marginTop={1} paddingLeft={2}>
          {activeMatches.slice(startIndex, startIndex + MAX_VISIBLE).map((cmd, relativeIndex) => {
            const absoluteIndex = startIndex + relativeIndex;
            const isSelected = absoluteIndex === selectedIndex;
            return (
              <Box key={cmd.name} backgroundColor={isSelected ? 'cyan' : undefined} paddingX={isSelected ? 1 : 0}>
                <Box width={22}>
                  <Text color={isSelected ? 'black' : 'gray'} bold={isSelected}>
                    {isSelected ? '› ' : '  '}
                    {cmd.name}
                  </Text>
                </Box>
                <Text color={isSelected ? 'black' : 'dimColor'}>{cmd.desc}</Text>
              </Box>
            );
          })}
          {activeMatches.length > MAX_VISIBLE && (
            <Box paddingLeft={1} marginTop={0}>
              <Text dimColor>
                {startIndex > 0 ? ' ↑ ' : '   '}
                Showing {startIndex + 1}-{Math.min(startIndex + MAX_VISIBLE, activeMatches.length)} of {activeMatches.length}
                {startIndex + MAX_VISIBLE < activeMatches.length ? ' ↓ ' : '   '}
              </Text>
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}

/** 与 Ink <Text> 相同的换行方式，用于计算光标的行/列 */
function wrapToWidth(text: string, width: number): string[] {
  const lines: string[] = [];
  for (const segment of text.split('\n')) {
    lines.push(...wrapAnsiNpm(segment, width, { hard: false, trim: false, wordWrap: true }).split('\n'));
  }
  return lines.length > 0 ? lines : [''];
}

function locateCursor(value: string, cursorOffset: number, width: number) {
  const before = value.slice(0, Math.max(0, Math.min(cursorOffset, value.length)));
  const lines = wrapToWidth(before, width);
  let line = lines.length - 1;
  let col = stringWidth(lines[line] ?? '');
  // 光标格本身也要占位：正好写满一行时落到下一行行首
  if (col >= width) {
    line += 1;
    col = 0;
  }
  const totalLines = Math.max(wrapToWidth(value, width).length, 1);
  return { line, col, totalLines };
}
