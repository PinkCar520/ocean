import React from 'react';
import { Box, Text } from 'ink';
import type { ModelMessage } from 'ai';
import { ToolCallDisplay } from './tool-call-display.js';

interface MessageListProps {
  messages: ModelMessage[];
  streamingText: string;
  isThinking: boolean;
  toolCalls: Array<{ name: string; args: any }>;
  toolResults: Array<{ name: string; result: any }>;
  commandOutput: string | null;
  commandType: 'help' | 'model' | 'skills' | 'tools' | 'mcp' | 'error' | null;
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
  const maxMessages = Math.min(messages.length, 20);
  const displayMessages = messages.slice(-maxMessages);

  return (
    <Box flexDirection="column" flexGrow={1}>
      {/* Previous messages */}
      {displayMessages.map((msg, i) => {
        if (msg.role === 'user') {
          return (
            <Box key={i} flexDirection="column" marginBottom={1}>
              <Text bold color="green">
                {`❯ ${msg.content as string}`}
              </Text>
            </Box>
          );
        }

        if (msg.role === 'assistant') {
          const content = typeof msg.content === 'string'
            ? msg.content
            : Array.isArray(msg.content)
              ? msg.content.map(part => typeof part === 'string' ? part : JSON.stringify(part)).join('')
              : '';

          return (
            <Box key={i} flexDirection="column" marginBottom={1}>
              <Text wrap="wrap">{content}</Text>
            </Box>
          );
        }

        return null;
      })}

      {/* Active tool calls */}
      {toolCalls.length > 0 && (
        <ToolCallDisplay toolCalls={toolCalls} toolResults={toolResults} />
      )}

      {/* Streaming text */}
      {streamingText && (
        <Box flexDirection="column" marginBottom={1}>
          <Text wrap="wrap">{streamingText}</Text>
        </Box>
      )}

      {/* Thinking indicator */}
      {isThinking && !streamingText && toolCalls.length === 0 && (
        <Box marginBottom={1}>
          <Text color="cyan">{'⠋ Thinking...'}</Text>
        </Box>
      )}

      {/* Command output */}
      {commandOutput && (
        <Box flexDirection="column" marginBottom={1}>
          <Text
            color={
              commandType === 'error'
                ? 'yellow'
                : commandType === 'help'
                  ? 'white'
                  : 'gray'
            }
          >
            {commandOutput}
          </Text>
        </Box>
      )}

      {/* Error */}
      {error && (
        <Box flexDirection="column" marginBottom={1}>
          <Text color="red">{`❌ Error: ${error}`}</Text>
        </Box>
      )}
    </Box>
  );
}
