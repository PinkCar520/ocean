import React from 'react';
import { Box, Text } from 'ink';
import type { LoadedSkill } from '../types.js';

interface StatusBarProps {
  userId: string;
  workspace: string;
  model: string;
  skills: LoadedSkill[];
}

export function StatusBar({ userId, workspace, model, skills }: StatusBarProps) {
  return (
    <Box flexDirection="column" paddingBottom={1}>
      <Box>
        <Text bold color="cyan">
          {' 🐼 UClaw AI'}
        </Text>
      </Box>
      <Box>
        <Text dimColor>
          {`User: ${userId} | Model: ${model} | Skills: ${skills.length} | `}
        </Text>
        <Text dimColor color="gray">
          {workspace}
        </Text>
      </Box>
      <Box>
        <Text dimColor>
          {'Type your query or /help for commands'}
        </Text>
      </Box>
      <Box>
        <Text>
          {'─'.repeat(60)}
        </Text>
      </Box>
    </Box>
  );
}
