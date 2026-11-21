import React, { useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { ApprovalDecision } from '../approval/types.js';
import type { PendingApproval } from '../approval/ink-approval.js';

interface ApprovalPromptProps {
  pending: PendingApproval;
  onDecide: (id: string, decision: ApprovalDecision) => void;
}

const OPTIONS: Array<{ label: string; decision: ApprovalDecision }> = [
  { label: 'Allow once', decision: { kind: 'approved', scope: 'once' } },
  { label: 'Allow for this session', decision: { kind: 'approved', scope: 'session' } },
  { label: 'Deny', decision: { kind: 'rejected', reason: 'Rejected by user.' } },
];

/** Format tool arguments for display without leaking huge payloads. */
function summarizeArgs(args: Record<string, unknown>): string {
  try {
    const text = JSON.stringify(args);
    return text.length > 500 ? `${text.slice(0, 500)}…` : text;
  } catch {
    return String(args);
  }
}

export function ApprovalPrompt({ pending, onDecide }: ApprovalPromptProps) {
  const [selected, setSelected] = useState(0);

  // Reset selection when the pending request changes.
  useEffect(() => {
    setSelected(0);
  }, [pending.id]);

  useInput((input, key) => {
    if (key.upArrow) {
      setSelected((s) => (s - 1 + OPTIONS.length) % OPTIONS.length);
      return;
    }
    if (key.downArrow) {
      setSelected((s) => (s + 1) % OPTIONS.length);
      return;
    }
    if (key.return) {
      onDecide(pending.id, OPTIONS[selected].decision);
      return;
    }
    if (key.escape) {
      onDecide(pending.id, { kind: 'rejected', reason: 'Rejected by user (Esc).' });
      return;
    }
    // Number keys 1/2/3 for quick selection.
    const num = parseInt(input, 10);
    if (num >= 1 && num <= OPTIONS.length) {
      onDecide(pending.id, OPTIONS[num - 1].decision);
    }
  });

  const { request } = pending;

  return (
    <Box flexDirection="column" marginTop={1} marginBottom={1}>
      <Box>
        <Text color="yellow" bold>⚠ Approval required</Text>
      </Box>
      <Box>
        <Text>Tool: </Text>
        <Text bold color="cyan">{request.toolName}</Text>
      </Box>
      <Box>
        <Text dimColor>Workspace: </Text>
        <Text>{request.workspace}</Text>
      </Box>
      <Box flexDirection="column">
        <Text dimColor>Arguments:</Text>
        <Text>{summarizeArgs(request.args)}</Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>Use ↑/↓ to choose, Enter to confirm, Esc to deny.</Text>
      </Box>
      {OPTIONS.map((option, index) => (
        <Box key={option.label} paddingLeft={1}>
          <Text color={index === selected ? 'green' : 'dimColor'} bold={index === selected}>
            {index === selected ? '›' : ' '} [{index + 1}] {option.label}
          </Text>
        </Box>
      ))}
    </Box>
  );
}
