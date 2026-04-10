import { Terminal, CheckCircle2, XCircle, Copy, Check } from 'lucide-react';
import { cn } from '../lib/utils';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import type { UICodeBlockProps } from '../types/ui-protocol';

export type { UICodeBlockProps };

export interface CodeBlockProps {
  command?: UICodeBlockProps['command'];
  output: UICodeBlockProps['output'];
  status: UICodeBlockProps['status'];
  language?: UICodeBlockProps['language'];
}

export function CodeBlock({ command, output, status, language = 'bash' }: CodeBlockProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const copyToClipboard = async () => {
    const text = command ? `$ ${command}\n${output}` : output;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-3 bg-white border border-slate-200 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <Terminal className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-[11px] font-mono text-slate-500 font-bold">
            {command || 'output'}
          </span>
          {language && <span className="text-[9px] uppercase font-bold text-slate-300">{language}</span>}
        </div>
        <div className="flex items-center gap-2">
          {status === 'success' ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
          ) : (
            <XCircle className="w-3.5 h-3.5 text-rose-500" />
          )}
          <button
            onClick={copyToClipboard}
            className="p-1 hover:bg-slate-200 rounded text-slate-400 hover:text-slate-600 transition-colors"
          >
            {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
          </button>
        </div>
      </div>

      {/* Output */}
      <pre className="p-4 text-[12px] font-mono text-slate-700 bg-slate-50/50 overflow-x-auto max-h-64 whitespace-pre-wrap">
        {output}
      </pre>
    </div>
  );
}
