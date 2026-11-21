import React from 'react';
import { Box, Text } from 'ink';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import type { LoadedSkill } from '../types.js';

const { version: CLI_VERSION } = createRequire(import.meta.url)('../../package.json') as { version: string };

const OCEAN_ICON = [
  "   ░▄████▄░",
  "  ▓██▓██▓██▓",
  "   ▀██  ██▀"
].join('\n');

/** Collapse the home directory to `~` for display. */
function displayWorkspace(workspace: string): string {
  const home = homedir();
  if (workspace === home) return '~';
  if (workspace.startsWith(`${home}/`)) return `~${workspace.slice(home.length)}`;
  return workspace;
}

interface StatusBarProps {
  userId: string;
  displayName?: string;
  workspace: string;
  model: string;
  permissionMode?: string;
  skills: LoadedSkill[];
}

export function StatusBar({ userId, displayName, workspace, model, skills, permissionMode }: StatusBarProps) {
  const providerColor = model.includes('qwen') || model.includes('deepseek')
    ? 'magenta'
    : model.includes('Gemma')
      ? 'blue'
      : 'cyan';

  return (
    <Box flexDirection="column" paddingTop={1} paddingBottom={1}>
      <Box marginBottom={1}>
        <Text color="cyan">{OCEAN_ICON}</Text>
        <Box marginLeft={3} flexDirection="column">
          <Box>
            <Text bold color="cyan">
              {'Ocean Code'}
            </Text>
            <Text color="gray">{`  (v${CLI_VERSION})`}</Text>
          </Box>
          <Box marginTop={1}>
            <Text color="gray">{displayWorkspace(workspace)}</Text>
          </Box>
        </Box>
      </Box>
      <Box>
        <Text>
          {`User: ${displayName || userId}  `}
        </Text>
        <Text bold color={providerColor}>
          {model}
        </Text>
        <Text>
          {`  Skills: ${skills.length}${permissionMode ? "  Mode: " + permissionMode : ""}`}
        </Text>
      </Box>
    </Box>
  );
}
