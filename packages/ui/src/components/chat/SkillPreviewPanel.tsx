import React, { useMemo, useState } from 'react';
import { Eye, Code2, X, Copy, Check, Cloud, ChevronDown, RotateCcw, Info } from 'lucide-react';
import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useReducedMotion } from '../../lib/useReducedMotion';
import { cn } from '../../lib/utils';

interface SkillPreviewPanelProps {
  attachment: {
    url: string;
    contentType?: string;
    name?: string;
  };
  onClose: () => void;
}

export function SkillPreviewPanel({ attachment, onClose }: SkillPreviewPanelProps) {
  const reducedMotion = useReducedMotion();
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<'preview' | 'code'>('preview');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [liveContent, setLiveContent] = useState<string | null>(null);

  // Decode and process content
  const parsedData = useMemo(() => {
    let rawContent = '';
    const sourceData = liveContent ?? attachment.url;
    try {
      if (sourceData.startsWith('data:')) {
        const b64 = sourceData.split(',')[1];
        const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
        rawContent = new TextDecoder('utf-8').decode(bytes);
      } else {
        rawContent = sourceData;
      }
    } catch {
      rawContent = '无法解码文件内容';
    }

    // Strip out the wrapping <skill_content> tags that might bleed into the preview
    // Also strip out the system metadata about skill directory that bleeds in at the bottom
    let cleanContent = rawContent
      .replace(/<skill_content[^>]*>\n?/g, '')
      .replace(/\n?<\/skill_content>/g, '')
      .replace(/Skill directory: .*?Relative paths in this skill are relative to the skill directory\.?/gi, '');

    let description = '';
    let bodyForPreview = cleanContent;
    const yamlRegex = /^---\r?\n([\s\S]*?)\r?\n---/;
    const match = cleanContent.match(yamlRegex);
    
    if (match) {
      const frontmatter = match[1];
      const descMatch = frontmatter.match(/description:\s*(?:'([^']*)'|"([^"]*)"|(.*))/i);
      if (descMatch) {
         description = descMatch[1] || descMatch[2] || descMatch[3] || '';
      }
      bodyForPreview = cleanContent.replace(yamlRegex, '').trim();
    }

    return { raw: cleanContent, bodyForPreview, description };
  }, [attachment.url, liveContent]);

  const handleCopy = () => {
    navigator.clipboard.writeText(parsedData.raw);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRefresh = async () => {
    try {
      setIsRefreshing(true);
      const skillName = attachment.name?.replace(/\.md$/, '') || '';
      if (!skillName) return;
      
      const res = await fetch(`/api/skills/content/${skillName}`);
      if (res.ok) {
        const data = await res.json();
        if (data.content) {
          setLiveContent(data.content);
        }
      }
    } catch (e) {
      console.error('Failed to refresh skill:', e);
    } finally {
      setIsRefreshing(false);
    }
  };

  const isImage = attachment.contentType?.startsWith('image/');

  return (
    <motion.div
      {...(reducedMotion
        ? { initial: false, animate: { x: 0, opacity: 1 } }
        : { initial: { x: '100%', opacity: 0 }, animate: { x: 0, opacity: 1 }, exit: { x: '100%', opacity: 0 }, transition: { type: 'spring', damping: 25, stiffness: 200 } }
      )}
      className="flex-1 flex flex-col h-full bg-background relative"
    >
      {/* Refined Header */}
      <div className="h-14 px-4 border-b border-border/80 flex items-center justify-between bg-background/95 backdrop-blur z-10 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center p-0.5 bg-muted/40 rounded-md border border-border/50">
            <button 
              onClick={() => setViewMode('preview')}
              className={cn("p-1 rounded-sm transition-colors", viewMode === 'preview' ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              <Eye className="w-4 h-4" />
            </button>
            <button 
              onClick={() => setViewMode('code')}
              className={cn("p-1 rounded-sm transition-colors", viewMode === 'code' ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              <Code2 className="w-4 h-4" />
            </button>
          </div>
          <span className="font-semibold text-[13px] text-foreground tracking-tight">
            {attachment.name || 'Preview'}
          </span>
        </div>
        
        <div className="flex items-center gap-1">
          {!isImage && (
            <>
              <button
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 rounded-md transition-colors"
              >
                <Cloud className="w-3.5 h-3.5 text-[#32ade6]" />
                Save skill
              </button>

              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 rounded-md transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied' : 'Copy'}
                <ChevronDown className="w-3 h-3 ml-0.5 opacity-60" />
              </button>

              <div className="h-4 w-px bg-border/80 mx-1" />

              <button 
                onClick={handleRefresh}
                disabled={isRefreshing}
                className={cn(
                  "p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/60 rounded-md transition-all",
                  isRefreshing && "opacity-50 cursor-not-allowed"
                )}
                title="Refresh"
              >
                <RotateCcw className={cn("w-3.5 h-3.5", isRefreshing && "animate-spin")} />
              </button>
              
              <div className="h-4 w-px bg-border/80 mx-1" />
            </>
          )}
          <button 
            onClick={onClose} 
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/60 rounded-md transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto custom-scrollbar bg-background">
        {isImage ? (
          <div className="p-6 md:p-8 flex items-center justify-center min-h-full">
            <img 
              src={attachment.url} 
              alt={attachment.name} 
              className="max-w-full rounded-xl border border-border shadow-sm" 
            />
          </div>
        ) : viewMode === 'code' ? (
          <div className="p-6 md:p-8">
            <pre className="font-mono text-[13px] text-muted-foreground leading-relaxed whitespace-pre-wrap break-words">
              {parsedData.raw}
            </pre>
          </div>
        ) : (
          <div className="p-6 md:px-10 md:py-8 max-w-[800px] mx-auto font-serif">
            {parsedData.description && (
              <div className="mb-8">
                <div className="flex items-center gap-1.5 text-muted-foreground mb-3">
                  <span className="text-[13px] font-medium font-sans">Description</span>
                  <Info className="w-3.5 h-3.5" />
                </div>
                <p className="text-[15px] leading-relaxed text-foreground/90 font-serif">
                  {parsedData.description}
                </p>
              </div>
            )}
            <div className="prose prose-slate prose-sm md:prose-base max-w-none 
              prose-headings:font-bold prose-headings:text-foreground prose-headings:tracking-tight prose-headings:font-serif
              prose-h1:text-[28px] prose-h1:pb-0 prose-h1:border-none prose-h1:mt-2
              prose-h2:text-[22px] prose-h2:mt-10 
              prose-h3:text-[18px] 
              prose-p:text-foreground/90 prose-p:leading-relaxed
              prose-li:text-foreground/90
              prose-strong:text-foreground
              prose-table:w-full prose-table:text-[14px] prose-table:mt-6
              prose-th:bg-transparent prose-th:text-foreground prose-th:font-bold prose-th:px-2 prose-th:py-3 prose-th:border-0 prose-th:border-b-2 prose-th:border-foreground/20 prose-th:text-left
              prose-td:px-2 prose-td:py-3 prose-td:border-0 prose-td:border-b prose-td:border-border/60 prose-td:text-foreground/90
              prose-pre:bg-muted/30 prose-pre:border prose-pre:border-border/30 prose-pre:shadow-sm prose-pre:text-foreground/90 prose-pre:font-sans
              prose-code:text-primary prose-code:bg-primary/5 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:font-medium prose-code:font-sans
              prose-blockquote:border-l-4 prose-blockquote:border-primary/50 prose-blockquote:bg-transparent prose-blockquote:px-4 py-1 prose-blockquote:not-italic prose-blockquote:text-muted-foreground
              transition-all"
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {parsedData.bodyForPreview}
              </ReactMarkdown>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
