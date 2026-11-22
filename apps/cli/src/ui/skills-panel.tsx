import React, { useState, useEffect } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import type { LoadedSkill } from '../types.js';
import { catalogTokens, skillKey } from '../skills/availability.js';

const sorts = ['name', 'source', 'tokens', 'status'] as const;
export type SkillSort = typeof sorts[number];
export function listSkills(skills: LoadedSkill[], query: string, sort: SkillSort, enabled: (s: LoadedSkill) => boolean) {
  const q = query.toLowerCase();
  return skills.filter(s => (s.manifest.name + ' ' + s.manifest.description).toLowerCase().includes(q)).sort((a,b) =>
    (sort === 'source' ? (a.source ?? 'project').localeCompare(b.source ?? 'project') :
      sort === 'tokens' ? catalogTokens(b) - catalogTokens(a) :
      sort === 'status' ? Number(enabled(b)) - Number(enabled(a)) : 0) ||
    a.manifest.name.localeCompare(b.manifest.name));
}
export function SkillsPanel({ skills, enabled, onToggle, onClose }: {
  skills: LoadedSkill[]; enabled: (skill: LoadedSkill) => boolean;
  onToggle: (skill: LoadedSkill) => void; onClose: () => void;
}) {
  const { stdout } = useStdout();
  const [size, setSize] = useState({ cols: stdout.columns || 80, rows: stdout.rows || 24 });
  useEffect(() => {
    const resize = () => setSize({ cols: stdout.columns || 80, rows: stdout.rows || 24 });
    stdout.on('resize', resize);
    return () => { stdout.off('resize', resize); };
  }, [stdout]);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [sort, setSort] = useState<SkillSort>('name');
  const [selected, setSelected] = useState('');
  const list = listSkills(skills, query, sort, enabled);
  const index = Math.max(0, list.findIndex(s => skillKey(s) === selected));
  const active = list[index];
  const visible = Math.max(1, size.rows - 10);
  const start = Math.max(0, Math.min(index - visible + 1, list.length - visible));
  useInput((input, key) => {
    if (key.escape) { if (searching) setSearching(false); else onClose(); return; }
    if (key.upArrow || key.downArrow) {
      if (list.length) setSelected(skillKey(list[(index + (key.upArrow ? -1 : 1) + list.length) % list.length]));
      return;
    }
    if (searching) {
      if (key.return) setSearching(false);
      else if (key.backspace || key.delete) setQuery(q => Array.from(q).slice(0,-1).join(''));
      else if (!key.ctrl && !key.meta && input && !/[\x00-\x1f\x7f]/.test(input)) setQuery(q => q + input);
      return;
    }
    if (input === '/') setSearching(true);
    else if (input === 't') setSort(s => sorts[(sorts.indexOf(s)+1)%sorts.length]);
    else if ((key.return || input === ' ') && active) { setSelected(skillKey(active)); onToggle(active); }
  });
  const wide = size.cols >= 42;
  const nameWidth = Math.max(4, Math.min(34, size.cols - (wide ? 25 : 8)));
  return <Box flexDirection="column">
    <Text color="cyan">{'─'.repeat(Math.max(1,size.cols-1))}</Text>
    <Box flexDirection="column" paddingX={1}>
      <Text color="cyan" bold>Skills</Text>
      <Text dimColor>{skills.length} skills · enter/space to cycle, / to search, t to sort, Esc to close</Text>
      <Box borderStyle="round" borderColor={searching ? 'cyan' : 'gray'} marginTop={1} paddingX={1}>
        <Text wrap="truncate-end" dimColor={!query}>⌕ {query || 'Search skills…'}{searching ? ' ▏' : ''}</Text>
      </Box>
      {list.slice(start,start+visible).map(s => {
        const current = s === active;
        return <Box key={skillKey(s)}>
          <Text color="cyan">{current ? '❯ ' : '  '}</Text>
          <Text color={enabled(s) ? 'green' : 'gray'}>{enabled(s) ? '✓ ' : '○ '}</Text>
          <Box width={nameWidth}><Text wrap="truncate-end" color={current ? 'cyan' : undefined}>{s.manifest.name}</Text></Box>
          {wide && <Text dimColor>{s.source ?? 'project'} · ~{catalogTokens(s)} tok</Text>}
        </Box>;
      })}
      {!list.length && <Text dimColor>{skills.length ? 'No matching skills' : 'No skills loaded'}</Text>}
      {list.length > visible && <Text dimColor>{start+1}–{Math.min(start+visible,list.length)} / {list.length}</Text>}
      {sort !== 'name' && <Text dimColor>Sort: {sort}</Text>}
    </Box>
  </Box>;
}
