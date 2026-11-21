import React from 'react';
import { Box, Text } from 'ink';
import type { LoadedSkill } from '../types.js';

interface StatusBarProps {
  userId: string;
  workspace: string;
  model: string;
  permissionMode?: string;
  skills: LoadedSkill[];
}

export function StatusBar({ userId, workspace, model, skills, permissionMode }: StatusBarProps) {
  const providerColor = model.includes('qwen') || model.includes('deepseek')
    ? 'magenta'
    : model.includes('Gemma')
      ? 'blue'
      : 'cyan';

  return (
    <Box flexDirection="column" paddingBottom={1}>
      <Box>
        <Text bold color="cyan">
          {'🐼 Ocean'}
        </Text>
      </Box>
      <Box>
        <Text>
          {`User: ${userId}  `}
        </Text>
        <Text bold color={providerColor}>
          {model}
        </Text>
        <Text>
          {`  Skills: ${skills.length}${permissionMode ? "  Mode: " + permissionMode : ""}`}
        </Text>
      </Box>
      <Box>
        <Text color="gray">
          {workspace.split('/').slice(-2).join('/')}
        </Text>
      </Box>
      <Box>
        <Text color="gray">
          {'Type your query or /help for commands'}
        </Text>
      </Box>
      <Box>
        <Text color="gray">
          {'─'.repeat(60)}
        </Text>
      </Box>
    </Box>
  );
}
