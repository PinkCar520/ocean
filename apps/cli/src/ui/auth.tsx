import React, { useState, useCallback } from 'react';
import { render, Box, Text, useInput, useApp } from 'ink';
import chalk from 'chalk';

interface AuthAppProps {
  onSelect: (action: 'browser' | 'headless' | 'apiKey') => void;
}

/**
 * Modern Auth UI using Ink
 */
export function AuthUI({ onSelect }: AuthAppProps) {
  const { exit } = useApp();
  const [selectedIndex, setSelectedIndex] = useState(0);

  const options = [
    { label: '1. Sign in with Browser (Recommended)', value: 'browser' },
    { label: '2. Sign in with Device Code', value: 'headless' },
    { label: '3. Provide your own API Key', value: 'apiKey' },
    { label: '4. Cancel', value: 'exit' },
  ];

  useInput((input, key) => {
    if (key.upArrow) {
      setSelectedIndex(prev => (prev > 0 ? prev - 1 : options.length - 1));
    }
    if (key.downArrow) {
      setSelectedIndex(prev => (prev < options.length - 1 ? prev + 1 : 0));
    }
    if (key.return) {
      const selected = options[selectedIndex];
      if (selected.value === 'exit') {
        exit();
        process.exit(0);
      } else {
        onSelect(selected.value as any);
      }
    }
    if (input === '1' || input === '2' || input === '3' || input === '4') {
        const idx = parseInt(input) - 1;
        if (options[idx].value === 'exit') {
            exit();
            process.exit(0);
        } else {
            onSelect(options[idx].value as any);
        }
    }
  });

  return (
    <Box flexDirection="column" padding={1} borderStyle="round" borderColor="cyan">
      <Box marginBottom={1}>
        <Text bold>Welcome to </Text>
        <Text bold color="cyan">UClaw</Text>
        <Text dimColor>, UClaw's command-line AI assistant</Text>
      </Box>

      <Box marginBottom={1}>
        <Text dimColor>
          Sign in to get started with your AI workspace.
        </Text>
      </Box>

      {options.map((opt, i) => (
        <Box key={opt.value} marginLeft={2}>
          <Text color={i === selectedIndex ? 'cyan' : undefined}>
            {i === selectedIndex ? '> ' : '  '}
            {opt.label}
          </Text>
        </Box>
      ))}

      <Box marginTop={1}>
        <Text dimColor italic>Use arrow keys to select, Enter to confirm</Text>
      </Box>
    </Box>
  );
}

/**
 * Entry point for Auth UI
 */
export async function runAuthMenu(): Promise<{ action: string }> {
  return new Promise((resolve) => {
    let chosenAction: string | null = null;
    
    const { unmount } = render(
      <AuthUI 
        onSelect={(action) => {
          chosenAction = action;
          unmount();
        }} 
      />
    );

    // Monitor when it's done
    const check = setInterval(() => {
      if (chosenAction) {
        clearInterval(check);
        resolve({ action: chosenAction });
      }
    }, 100);
  });
}
