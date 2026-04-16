import React from 'react';
import { 
  Terminal,
  Zap, 
  Cpu, 
  ExternalLink,
  FolderCode
} from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '../../lib/utils';

interface ActiveContextProps {
  context?: {
    workspace?: {
      name: string;
      branch: string;
      isClean: boolean;
      path?: string;
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
  const data = context || {};
  const workspace = data.workspace || {
    name: 'uClaw',
    branch: 'main',
    isClean: true
  };

  return (
    <div className="flex flex-col h-full p-6 space-y-8">
      {/* Header */}
      <div className="flex items-center gap-2 text-[#716B67] mb-2">
        <Terminal className="w-4 h-4" />
        <h2 className="text-xs font-bold tracking-widest uppercase">Workspace Context</h2>
      </div>

      {/* Workspace Card */}
      <div className="bg-[#1C1B1B] rounded-[24px] p-5 text-white shadow-xl space-y-5 group">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center text-[#EC5B14] group-hover:bg-[#EC5B14] group-hover:text-white transition-all duration-300">
            <FolderCode className="w-6 h-6" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-[16px] font-bold truncate leading-tight">
              {workspace.name} 
              <span className="text-white/40 font-normal ml-1.5 text-[12px]">({workspace.path?.split('/').pop() || 'root'})</span>
            </h3>
            <p className="text-[10px] text-[#EC5B14] truncate mt-1 font-mono font-bold">{workspace.path || '~/workspace/uwork/uclaw'}</p>
            <div className="flex items-center gap-1.5 mt-2">
              <span className="text-[11px] text-white/50 font-bold px-2 py-0.5 rounded bg-white/5 border border-white/10 tracking-tight">
                {workspace.branch}
              </span>

              {!workspace.isClean && (
                <span className="flex items-center gap-1 ml-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
                  <span className="text-[10px] text-orange-500/80 font-bold uppercase tracking-tighter">Modified</span>
                </span>
              )}
            </div>
          </div>
        </div>

        <button 
          onClick={() => onAction?.('open_ide')}
          className="w-full py-3 rounded-xl bg-white/5 border border-white/10 text-[13px] font-bold text-white hover:bg-[#EC5B14] hover:border-[#EC5B14] transition-all duration-300 flex items-center justify-center gap-2 group/btn"
        >
          <ExternalLink className="w-4 h-4 group-hover/btn:translate-x-0.5 group-hover/btn:-translate-y-0.5 transition-transform" />
          Open in IDE
        </button>
      </div>

      {/* Model Metrics */}
      <div className="grid grid-cols-1 gap-3">
        <div className="bg-[#FDFCFB] rounded-[20px] border border-[#F1EEEB] p-4 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-[#716B67] uppercase tracking-tight mb-0.5">Active Model</p>
            <div className="flex items-center gap-2">
              <Cpu className="w-3.5 h-3.5 text-[#1C1B1B]" />
              <span className="text-[12px] font-bold text-[#1C1B1B]">{data.modelInfo?.name}</span>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-bold text-[#716B67] uppercase tracking-tight mb-0.5">Latency</p>
            <div className="flex items-center justify-end gap-1.5">
              <Zap className="w-3.5 h-3.5 text-[#EC5B14]" />
              <span className="text-[12px] font-bold text-[#1C1B1B]">{data.modelInfo?.latency}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Suggested Actions */}
      {data.suggestions && data.suggestions.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-[10px] font-bold text-[#716B67] uppercase tracking-widest">Quick Actions</h4>
          <div className="flex flex-wrap gap-2">
            {data.suggestions.map((suggestion, idx) => (
              <button
                key={idx}
                onClick={() => onAction?.(suggestion)}
                className="px-4 py-2 rounded-full bg-white border border-[#E8E4E2] text-[12px] font-bold text-[#1C1B1B] hover:border-[#EC5B14] hover:text-[#EC5B14] transition-all"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
