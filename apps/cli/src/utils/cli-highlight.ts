import { useEffect, useState } from 'react';

export type CliHighlight = {
  highlight: typeof import('cli-highlight').highlight;
  supportsLanguage: typeof import('cli-highlight').supportsLanguage;
};

let cliHighlightPromise: Promise<CliHighlight | null> | undefined;

function loadCliHighlight(): Promise<CliHighlight | null> {
  try {
    cliHighlightPromise ??= import('cli-highlight')
      .then((mod) => ({ highlight: mod.highlight, supportsLanguage: mod.supportsLanguage }))
      .catch(() => null);
  } catch {
    return Promise.resolve(null);
  }
  return cliHighlightPromise;
}

/**
 * 语法高亮按需异步加载：首帧先以纯文本渲染，加载完成后重渲染带高亮版本。
 * 与 restored-src 的 Suspense 方案等价，但避免在流式输出中触发挂起回退。
 */
export function useCliHighlight(): CliHighlight | null {
  const [highlight, setHighlight] = useState<CliHighlight | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadCliHighlight().then((loaded) => {
      if (!cancelled && loaded) setHighlight(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return highlight;
}
