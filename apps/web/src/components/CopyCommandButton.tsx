'use client';

import { useState } from 'react';

export function CopyCommandButton({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }
  return <button type="button" onClick={copy} aria-label={copied ? 'Command copied' : 'Copy command'} className="rounded-lg border border-white/25 px-3 py-2 text-xs font-semibold text-white hover:border-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ff9c70]">{copied ? 'Copied' : 'Copy'}</button>;
}
