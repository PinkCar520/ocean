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
    file?: {
      name: string;
      path: string;
      status: string;
      progress: number;
      type: string;
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
  // Mock data for initial implementation if no context provided
  const data = context || {
    file: {
      name: 'gitlab-api-v4.ts',
      path: '/src/lib/auth/',
      status: 'ANALYZING',
      progress: 78,
      type: 'Security Audit'
    },
    modelInfo: {
      name: 'uClaw v4-Turbo',
      latency: '~240ms'
    },
    suggestions: ['Verify OAuth Scopes', 'Scan Secret Variables']
  };

  return (
    <div className="flex flex-col h-full p-6 space-y-8">
      {/* Header */}
      <div className="flex items-center gap-2 text-[#716B67] mb-2">
        <Share2 className="w-4 h-4 rotate-90" />
        <h2 className="text-xs font-bold tracking-widest uppercase">Active Context</h2>
      </div>

      {/* Active File Card */}
      {data.file && (
        <div className="bg-white rounded-[24px] border border-[#E8E4E2] p-5 shadow-sm space-y-4">
          <div className="flex items-start justify-between">
            <div className="flex gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#F6F3F2] flex items-center justify-center text-[#EC5B14]">
                <FileCode className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-[14px] font-bold text-[#1C1B1B] leading-tight">
                  {data.file.name}
                  <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] bg-[#FEF3EB] text-[#EC5B14] font-bold">
                    ● {data.file.status}
                  </span>
                </h3>
                <p className="text-[11px] text-[#716B67] mt-1">{data.file.path}</p>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="h-1.5 w-full bg-[#F6F3F2] rounded-full overflow-hidden">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${data.file.progress}%` }}
                className="h-full bg-[#EC5B14]"
              />
            </div>
            <div className="flex justify-between text-[10px] font-bold">
              <span className="text-[#716B67]">{data.file.type}</span>
              <span className="text-[#1C1B1B]">{data.file.progress}% complete</span>
            </div>
          </div>

          <button 
            onClick={() => onAction?.('open_source')}
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
