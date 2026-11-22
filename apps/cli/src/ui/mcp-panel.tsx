import React, { useState, useEffect } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import type { McpClientManager } from '../mcp/client.js';

export function McpPanel({ manager, onClose }: { manager: McpClientManager; onClose: () => void }) {
  const [servers, setServers] = useState(() => manager.getManagedServers());
  const [index, setIndex] = useState(0);
  const [detail, setDetail] = useState(false);
  const [showTools, setShowTools] = useState(false);
  const [action, setAction] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { stdout } = useStdout();
  useEffect(() => { const timer = setInterval(() => setServers(manager.getManagedServers()), 500); return () => clearInterval(timer); }, [manager]);
  const rows = [...servers].sort((a,b) => a.scope.localeCompare(b.scope) || a.name.localeCompare(b.name));
  const selected = rows[index];
  const actions = selected ? ['View tools', ...(selected.trusted ? [selected.status === 'disabled' ? 'Enable server' : 'Disable server', ...(selected.status === 'disabled' ? [] : ['Reconnect'])] : [])] : [];
  useInput((input, key) => {
    if (busy) return;
    if (key.escape) {
      if (showTools) setShowTools(false);
      else if (detail) { setDetail(false); setError(''); }
      else onClose();
      return;
    }
    if (showTools) return;
    if (key.upArrow || key.downArrow) {
      const delta = key.upArrow ? -1 : 1;
      if (detail) setAction(i => (i + delta + actions.length) % actions.length);
      else if (rows.length) setIndex(i => (i + delta + rows.length) % rows.length);
    } else if (key.return && selected) {
      if (!detail) { setDetail(true); setAction(0); return; }
      if (actions[action] === 'View tools') { setShowTools(true); return; }
      const choice = actions[action];
      if (!choice) return;
      setBusy(true); setError('');
      void (async () => {
        try {
          await manager.configureServer(selected.name, choice === 'Reconnect' ? undefined : choice === 'Enable server');
          await manager.getAllTools();
        } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
        finally { setServers(manager.getManagedServers()); setAction(0); setBusy(false); }
      })();
    }
  });
  const width = Math.max(8, Math.min(36, ...rows.map(s => s.name.length + 2), (stdout.columns || 80)-25));
  const visible = Math.max(1, Math.floor(((stdout.rows || 24)-8)/2));
  const start = Math.max(0, index-visible+1);
  const window = rows.slice(start,start+visible);
  return <Box flexDirection="column">
    <Text color="cyan">{'─'.repeat(Math.max(1,(stdout.columns || 80)-1))}</Text>
    <Box flexDirection="column" paddingX={1}>
      <Text color="cyan" bold>{detail && selected ? selected.name : 'Manage MCP servers'}</Text>
      {!detail && <>
        <Text dimColor>{rows.length} servers</Text>
        {window.map((s,i) => <Box key={s.name} flexDirection="column">
          {(i===0 || window[i-1].scope!==s.scope) && <Box marginTop={1}><Text bold>{s.scope} MCPs </Text><Text dimColor wrap="truncate-end">({s.file || 'SDK'})</Text></Box>}
          <Box><Text color="cyan">{start+i===index?'❯ ':'  '}</Text><Text color={s.status==='connected'?'green':s.status==='needs-auth'?'yellow':s.status==='failed'?'red':'gray'}>{s.status==='connected'?'✓ ':s.status==='needs-auth'?'⚠ ':s.status==='failed'?'✗ ':'○ '}</Text>
          <Box width={width}><Text color={start+i===index?'cyan':undefined} wrap="truncate-end">{s.name}</Text></Box>
          <Text dimColor wrap="truncate-end">{s.status==='connected'?s.tools.length+' tools':s.status==='needs-auth'?'needs authentication':!s.trusted?'untrusted':s.status}</Text></Box>
        </Box>)}
        {!rows.length && <Text dimColor>No MCP servers configured</Text>}
      </>}
      {detail && selected && <>
        <Text dimColor>Status: {selected.status}</Text><Text dimColor>Scope: {selected.scope}</Text><Text dimColor>Transport: {selected.transport}</Text>
        {!selected.trusted && <Text color="yellow">Untrusted workspace configuration. Enable from a trusted personal configuration.</Text>}
        {selected.status==='needs-auth' && <Text color="yellow">Authentication required. Interactive OAuth is not yet supported.</Text>}
        {showTools ? selected.tools.length ? selected.tools.slice(0,Math.max(1,(stdout.rows||24)-9)).map(name=><Text key={name} wrap="truncate-end">{name}</Text>) : <Text dimColor>No available tools</Text> : actions.map((name,i)=><Text key={name} color={i===action?'cyan':undefined}>{i===action?'❯ ':'  '}{name}</Text>)}
      </>}
      {busy && <Text dimColor>Updating connection…</Text>}
      {error && <Text color="red">{error}</Text>}
      <Box marginTop={1}><Text dimColor italic>{showTools?'Esc to go back':'↑/↓ to navigate · Enter to confirm · Esc to cancel'}</Text></Box>
    </Box>
  </Box>;
}
