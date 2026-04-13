import React from 'react';
import { Box, Text } from 'ink';

interface ToolCallDisplayProps {
  toolCalls: Array<{ name: string; args: any }>;
  toolResults: Array<{ name: string; result: any }>;
}

export function ToolCallDisplay({ toolCalls, toolResults }: ToolCallDisplayProps) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      {toolCalls.map((tc, i) => {
        const argsStr = typeof tc.args === 'string'
          ? tc.args
          : JSON.stringify(tc.args).slice(0, 80);

        const result = toolResults[i];

        return (
          <Box key={i} flexDirection="column" marginBottom={1}>
            <Box>
              <Text color="yellow">
                {`🔧 ${tc.name}`}
              </Text>
              <Text color="gray">
                {` ${argsStr.slice(0, 50)}${argsStr.length > 50 ? '...' : ''}`}
              </Text>
            </Box>
            {result && (
              <Box marginLeft={2}>
                <Text color="gray">
                  {`↳ ${typeof result.result === 'string' ? result.result.slice(0, 60) : JSON.stringify(result.result).slice(0, 60)}`}
                </Text>
              </Box>
            )}
          </Box>
        );
      })}
    </Box>
  );
}
