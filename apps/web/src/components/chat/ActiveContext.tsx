import React from 'react';
import { 
  FileCode, 
  Search, 
  ExternalLink, 
  Zap, 
  Cpu, 
  ArrowRight,
  Share2
} from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '../../lib/utils';

interface ActiveContextProps {
  context?: {
    type?: 'file' | 'workspace';
    file?: {
      name: string;
      path: string;
      status: string;
      progress: number;
      type: string;
    };
    workspace?: {
      name: string;
      branch: string;
      isClean: boolean;
    };
    modelInfo?: {
      name: string;
      latency: string;
    };
    suggestions?: string[];
  };
  onAction?: (action: string) => void;
}

export function ActiveContextPanel({ context, onAction }: ActiveContextProps) {
  // Use provided context or fall back to empty/default state
  const data = context || {};
  const file = data.file;
  const workspace = data.workspace;

  return (
    <div className="flex flex-col h-full p-6 space-y-8">
      {/* Header */}
      <div className="flex items-center gap-2 text-[#716B67] mb-2">
        <Share2 className="w-4 h-4 rotate-90" />
        <h2 className="text-xs font-bold tracking-widest uppercase">Active Context</h2>
      </div>

      {/* Workspace Card (New) */}
      {workspace && (
        <div className="bg-[#1C1B1B] rounded-[24px] p-5 text-white shadow-lg space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-[#EC5B14]">
              <Zap className="w-5 h-5 fill-current" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-[14px] font-bold truncate">{workspace.name}</h3>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="text-[10px] text-white/50 font-medium px-1.5 py-0.5 rounded bg-white/5 border border-white/10">
                  {workspace.branch}
                </span>
                {!workspace.isClean && (
                  <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Active File Card */}
      {file && (
        <div className="bg-white rounded-[24px] border border-[#E8E4E2] p-5 shadow-sm space-y-4">
          <div className="flex items-start justify-between">
            <div className="flex gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#F6F3F2] flex items-center justify-center text-[#EC5B14]">
                <FileCode className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-[14px] font-bold text-[#1C1B1B] leading-tight">
                  {file.name}
                  <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] bg-[#FEF3EB] text-[#EC5B14] font-bold">
                    ● {file.status}
                  </span>
                </h3>
                <p className="text-[11px] text-[#716B67] mt-1 truncate max-w-[140px]">{file.path}</p>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="h-1.5 w-full bg-[#F6F3F2] rounded-full overflow-hidden">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${file.progress}%` }}
                className="h-full bg-[#EC5B14]"
              />
            </div>
            <div className="flex justify-between text-[10px] font-bold">
              <span className="text-[#716B67]">{file.type}</span>
              <span className="text-[#1C1B1B]">{file.progress}% complete</span>
            </div>
          </div>

          <button 
            onClick={() => onAction?.(`open ${file.path}`)}
            className="w-full py-2.5 rounded-xl border border-[#E8E4E2] text-[12px] font-bold text-[#1C1B1B] hover:bg-[#F6F3F2] transition-colors flex items-center justify-center gap-2"
          >
            <Search className="w-3.5 h-3.5" />
            Open Source
          </button>
        </div>
      )}

      {/* Model Metrics */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-[#FDFCFB] rounded-[20px] border border-[#F1EEEB] p-4">
          <p className="text-[10px] font-bold text-[#716B67] uppercase tracking-tight mb-1">Model</p>
          <div className="flex items-center gap-1.5">
            <Cpu className="w-3.5 h-3.5 text-[#1C1B1B]" />
            <span className="text-[12px] font-bold text-[#1C1B1B] truncate">{data.modelInfo?.name}</span>
          </div>
        </div>
        <div className="bg-[#FDFCFB] rounded-[20px] border border-[#F1EEEB] p-4">
          <p className="text-[10px] font-bold text-[#716B67] uppercase tracking-tight mb-1">Latency</p>
          <div className="flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-[#1C1B1B]" />
            <span className="text-[12px] font-bold text-[#1C1B1B]">{data.modelInfo?.latency}</span>
          </div>
        </div>
      </div>

      {/* Suggested Actions */}
      <div className="space-y-3">
        <h4 className="text-[10px] font-bold text-[#716B67] uppercase tracking-widest">Suggested Next</h4>
        <div className="flex flex-wrap gap-2">
          {data.suggestions?.map((suggestion, idx) => (
            <button
              key={idx}
              onClick={() => onAction?.(suggestion)}
              className="px-4 py-2 rounded-full bg-[#FEF3EB] border border-[#FBE0D3] text-[12px] font-bold text-[#EC5B14] hover:bg-[#FBE0D3] transition-colors"
            >
              {suggestion}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
