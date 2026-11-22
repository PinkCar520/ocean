'use client';

import { useState } from 'react';

type CopyStatus = 'idle' | 'copied' | 'failed';

export function CopyCommandButton({ command }: { command: string }) {
  const [status, setStatus] = useState<CopyStatus>('idle');

  async function copy() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(command);
      setStatus('copied');
    } catch {
      setStatus('failed');
    }
  }

  const label = status === 'copied' ? 'Copied' : status === 'failed' ? 'Copy failed' : 'Copy';
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button type="button" onClick={copy} aria-label={status === 'copied' ? 'Command copied' : 'Copy command'} className="rounded-lg border border-white/25 px-3 py-2 text-xs font-semibold text-white hover:border-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ff9c70]">
        {label}
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {status === 'copied' ? 'Command copied to clipboard.' : status === 'failed' ? 'Clipboard unavailable. Select and copy the command manually.' : ''}
      </span>
    </span>
  );
}
