'use client';

import { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { MarkdownComponents } from './MarkdownConfig';

export function ChatMarkdown({ text, onExtract, readOnly = false }: {
  text: string;
  onExtract?: (data: { title: string; content: string; language: string }) => void;
  readOnly?: boolean;
}) {
  const components = useMemo(() => ({
    ...MarkdownComponents(onExtract),
    ...(readOnly ? { img: ({ alt }: { alt?: string }) => alt ?? null } : {}),
  }), [onExtract, readOnly]);
  return <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>{text}</ReactMarkdown>;
}
