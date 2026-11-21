import { marked, type Token } from 'marked';
import React, { useMemo, useRef } from 'react';
import { Box } from 'ink';
import { Ansi } from './ansi.js';
import { configureMarked, formatToken } from './format.js';

// 与 restored-src/src/components/Markdown.tsx 同一套策略：
// marked 词法分析 → token 树 → ANSI 字符串 → Ink <Text>。

const TOKEN_CACHE_MAX = 500;
const tokenCache = new Map<string, Token[]>();

// 没有 Markdown 标记时跳过 marked 解析（短回复、普通句子占多数）。
const MD_SYNTAX_RE = /[#*`|[>\-_~]|\n\n|^\d+\. |\n\d+\. /;

function hasMarkdownSyntax(text: string): boolean {
  return MD_SYNTAX_RE.test(text.length > 500 ? text.slice(0, 500) : text);
}

function hashContent(content: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < content.length; i++) {
    hash ^= content.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

function cachedLexer(content: string): Token[] {
  if (!hasMarkdownSyntax(content)) {
    return [{
      type: 'paragraph',
      raw: content,
      text: content,
      tokens: [{ type: 'text', raw: content, text: content }],
    } as Token];
  }
  const key = hashContent(content);
  const hit = tokenCache.get(key);
  if (hit) {
    // 提升为 MRU，避免滚动回看历史消息时被 FIFO 淘汰
    tokenCache.delete(key);
    tokenCache.set(key, hit);
    return hit;
  }
  const tokens = marked.lexer(content);
  if (tokenCache.size >= TOKEN_CACHE_MAX) {
    const first = tokenCache.keys().next().value;
    if (first !== undefined) tokenCache.delete(first);
  }
  tokenCache.set(key, tokens);
  return tokens;
}

/** 把 Markdown 文本渲染成终端样式文本。 */
export function Markdown({ children }: { children: string }): React.ReactNode {
  configureMarked();
  const ansi = useMemo(() => {
    const content = children ?? '';
    if (!content.trim()) return '';
    // 纯文本快速路径：直接输出，不经过 ANSI 解析
    if (!hasMarkdownSyntax(content)) return content;
    return cachedLexer(content).map((token) => formatToken(token)).join('').trim();
  }, [children]);

  if (!ansi) return null;
  return <Ansi>{ansi}</Ansi>;
}

/**
 * 流式渲染：以最后一个顶层 token 为界，稳定前缀只解析一次，
 * 仅尾部仍在增长的块随增量重新解析。
 */
export function StreamingMarkdown({ children }: { children: string }): React.ReactNode {
  configureMarked();
  const stablePrefixRef = useRef('');

  const content = children ?? '';
  if (!content.startsWith(stablePrefixRef.current)) stablePrefixRef.current = '';

  const boundary = stablePrefixRef.current.length;
  const tokens = marked.lexer(content.slice(boundary));

  let lastContentIndex = tokens.length - 1;
  while (lastContentIndex >= 0 && tokens[lastContentIndex]!.type === 'space') lastContentIndex--;

  let advance = 0;
  for (let i = 0; i < lastContentIndex; i++) advance += tokens[i]!.raw.length;
  if (advance > 0) stablePrefixRef.current = content.slice(0, boundary + advance);

  const stablePrefix = stablePrefixRef.current;
  const unstableSuffix = content.slice(stablePrefix.length);

  return (
    <Box flexDirection="column">
      {stablePrefix ? <Markdown>{stablePrefix}</Markdown> : null}
      {unstableSuffix ? <Markdown>{unstableSuffix}</Markdown> : null}
    </Box>
  );
}
