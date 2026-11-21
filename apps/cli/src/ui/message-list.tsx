import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import type { ModelMessage } from 'ai';
import { ToolCallDisplay } from './tool-call-display.js';
import { Markdown, StreamingMarkdown } from './markdown/markdown.js';

// Spinner animation frames for "thinking" state
const SPINNERS = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

// Blinking cursor for typing animation
const CURSOR = '▊';

/** Extract readable text from string or AI SDK content parts. */
function extractText(content: unknown): string {
  if (typeof content === 'string') {
    const trimmed = content.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed === 'object' && typeof parsed.text === 'string'
          && (parsed.type === 'text' || parsed.type === undefined)) {
          return parsed.text;
        }
      } catch { /* not JSON, render as-is */ }
    }
    return content;
  }
  if (Array.isArray(content)) return content.map(extractText).join('');
  if (content && typeof content === 'object' && typeof (content as { text?: unknown }).text === 'string') {
    return (content as { text: string }).text;
  }
  return '';
}

interface MessageListProps {
  messages: ModelMessage[];
  streamingText: string;
  isThinking: boolean;
  toolCalls: Array<{ name: string; args: any }>;
  toolResults: Array<{ name: string; result: any }>;
  commandOutput: string | null;
  commandType: 'help' | 'model' | 'skills' | 'tools' | 'mcp' | 'tasks' | 'error' | null;
  error: string | null;
}

export function MessageList({
  messages,
  streamingText,
  isThinking,
  toolCalls,
  toolResults,
  commandOutput,
  commandType,
  error,
}: MessageListProps) {
  const [spinnerFrame, setSpinnerFrame] = useState(0);
  const [cursorVisible, setCursorVisible] = useState(true);

  // Spinner animation
  useEffect(() => {
    if (!isThinking) return;
    const interval = setInterval(() => {
      setSpinnerFrame(prev => (prev + 1) % SPINNERS.length);
    }, 80);
    return () => clearInterval(interval);
  }, [isThinking]);

  // Cursor blink animation
  useEffect(() => {
    if (!streamingText && !isThinking) return;
    const interval = setInterval(() => {
      setCursorVisible(prev => !prev);
    }, 530);
    return () => clearInterval(interval);
  }, [streamingText, isThinking]);

  const maxMessages = Math.min(messages.length, 20);
  const displayMessages = messages.slice(-maxMessages);

  return (
    <Box flexDirection="column" flexGrow={1}>
      {/* Previous messages */}
      {displayMessages.map((msg, i) => {
        if (msg.role === 'user') {
          return (
            <Box key={i} flexDirection="column" marginBottom={1}>
              <Box>
                <Text bold color="green">
                  {'❯ '}
                </Text>
                <Text bold>
                  {extractText(msg.content)}
                </Text>
              </Box>
            </Box>
          );
        }

        if (msg.role === 'assistant') {
          const content = extractText(msg.content);
          if (!content.trim()) return null;

          return (
            <Box key={i} flexDirection="column" marginBottom={1}>
              <Box>
                <Text bold color="cyan">{'▸ '}</Text>
                <Box flexDirection="column" flexShrink={1}>
                  <Markdown>{content}</Markdown>
                </Box>
              </Box>
            </Box>
          );
        }

        return null;
      })}

      {/* Active tool calls */}
      {toolCalls.length > 0 && (
        <ToolCallDisplay toolCalls={toolCalls} toolResults={toolResults} />
      )}

      {/* Streaming text with typing cursor */}
      {streamingText && (
        <Box flexDirection="column" marginBottom={1}>
          <Box>
            <Text bold color="cyan">{'▸ '}</Text>
            <Box flexDirection="column" flexShrink={1}>
              <StreamingMarkdown>{streamingText}</StreamingMarkdown>
              <Text bold color="cyan">{cursorVisible ? CURSOR : ' '}</Text>
            </Box>
          </Box>
        </Box>
      )}

      {/* Thinking indicator with spinner */}
      {isThinking && !streamingText && toolCalls.length === 0 && (
        <Box marginBottom={1}>
          <Text bold color="cyan">
            {`${SPINNERS[spinnerFrame]} Thinking...`}
          </Text>
        </Box>
      )}

      {/* Command output */}
      {commandOutput && (
        <Box flexDirection="column" marginBottom={1}>
          <Box>
            <Text bold
              color={
                commandType === 'error'
                  ? 'yellow'
                  : commandType === 'help'
                    ? 'white'
                    : 'green'
              }
            >
              {commandOutput}
            </Text>
          </Box>
        </Box>
      )}

      {/* Error */}
      {error && (
        <Box flexDirection="column" marginBottom={1}>
          <Text bold color="red">{`✗ ${error}`}</Text>
        </Box>
      )}
    </Box>
  );
}

