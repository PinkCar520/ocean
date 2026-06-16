import React, { useState, useMemo } from 'react';
import { api } from '../lib/api-client';
import { 
  Play, 
  Activity, 
  CheckCircle2, 
  XCircle, 
  ChevronDown, 
  ChevronUp, 
  Eye, 
  FileText, 
  Cpu, 
  Clock, 
  Coins, 
  Plus, 
  Trash2, 
  Settings, 
  Sparkles,
  Info
} from 'lucide-react';
import { cn } from '../lib/utils';

// Helper to extract variables wrapped in {{...}}
const extractVariables = (text: string) => {
  if (!text) return [];
  const regex = /\{\{\s*(\w+)\s*\}\}/g;
  const vars = new Set<string>();
  let match;
  while ((match = regex.exec(text)) !== null) {
    vars.add(match[1]);
  }
  return Array.from(vars);
};

export function SkillSandbox({ activeSkill }: { activeSkill: any }) {
  const [message, setMessage] = useState('');
  const [result, setResult] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'response' | 'prompt'>('response');

  // Variable states
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [manualVars, setManualVars] = useState<{ key: string; value: string }[]>([]);
  const [isVarsExpanded, setIsVarsExpanded] = useState(false);

  // Automatically detect variables in prompt & message
  const detectedKeys = useMemo(() => {
    const promptVars = extractVariables(activeSkill?.content || '');
    const msgVars = extractVariables(message);
    return Array.from(new Set([...promptVars, ...msgVars]));
  }, [activeSkill?.content, message]);

  const handleVariableChange = (key: string, value: string) => {
    setVariables(prev => ({ ...prev, [key]: value }));
  };

  const addManualVar = () => {
    setManualVars(prev => [...prev, { key: '', value: '' }]);
  };

  const removeManualVar = (index: number) => {
    setManualVars(prev => prev.filter((_, i) => i !== index));
  };

  const handleManualVarChange = (index: number, field: 'key' | 'value', value: string) => {
    setManualVars(prev => prev.map((v, i) => {
      if (i === index) {
        return { ...v, [field]: value };
      }
      return v;
    }));
  };

  const handleTest = async () => {
    if (!message.trim()) return;
    setIsLoading(true);
    setError('');
    setResult(null);

    // Merge automatic detected variables with manual variables
    const mergedVariables: Record<string, string> = {};
    
    // Copy all detected variable values
    detectedKeys.forEach(k => {
      mergedVariables[k] = variables[k] || '';
    });
    
    // Merge manual variables
    manualVars.forEach(v => {
      if (v.key.trim()) {
        mergedVariables[v.key.trim()] = v.value;
      }
    });

    try {
      const payload = {
        message: message,
        activeSkill: {
          name: activeSkill?.name || 'TestSkill',
          content: activeSkill?.content || '',
          triggerKws: activeSkill?.triggerKws || []
        },
        variables: mergedVariables
      };

      // Call NestJS gateway sandbox route
      const res: any = await api.post('/api/skills/sandbox/test', payload);
      
      if (res.success && res.data) {
        setResult(res.data);
        setActiveTab('response'); // Reset to response tab on new run
      } else {
        throw new Error(res.error || 'Execution failed');
      }
    } catch (err: any) {
      console.error('Sandbox error', err);
      setError(err.message || 'Test failed');
    } finally {
      setIsLoading(false);
    }
  };

  // Syntax highlighting for prompt tags
  const highlightPromptTags = (promptText: string) => {
    if (!promptText) return '';
    
    let safeHtml = promptText
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    // Highlight <injected_skills> and </injected_skills> in yellow
    safeHtml = safeHtml.replace(
      /(&lt;injected_skills&gt;)/g,
      '<span class="text-yellow-400 font-bold">$1</span>'
    );
    safeHtml = safeHtml.replace(
      /(&lt;\/injected_skills&gt;)/g,
      '<span class="text-yellow-400 font-bold">$1</span>'
    );

    // Highlight <skill name="..."> in cyan/blue
    safeHtml = safeHtml.replace(
      /(&lt;skill name="[^"]+"&gt;)/g,
      '<span class="text-cyan-400 font-bold">$1</span>'
    );
    safeHtml = safeHtml.replace(
      /(&lt;\/skill&gt;)/g,
      '<span class="text-cyan-400 font-bold">$1</span>'
    );

    return <div dangerouslySetInnerHTML={{ __html: safeHtml }} />;
  };

  return (
    <div className="flex flex-col h-full w-full bg-transparent">
      {/* Header */}
      <div className="px-4 py-0 border-b border-[#E8E4E2] bg-transparent flex items-center justify-between shrink-0 h-[60px]">
        <h3 className="font-sans text-[14px] font-bold text-[#1C1B1B] flex items-center gap-2">
          <Activity className="w-4 h-4 text-[#EC5B14] animate-pulse" />
          Sandbox Testing
        </h3>
      </div>
      
      {/* Scrollable Container */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        {/* Input Textarea */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-bold text-[#716B67] uppercase tracking-wider">Test Message</label>
          <div className="relative">
            <textarea
              id="sandbox-test-message"
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="e.g. 帮我分析这个报错... (Press ⌘+Enter to Run)"
              className="w-full border border-[#E8E4E2] rounded-xl p-3 pb-12 text-sm focus:outline-none focus:ring-2 focus:ring-[#EC5B14]/30 min-h-[100px] resize-none"
              onKeyDown={e => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  handleTest();
                }
              }}
            />
            <div className="absolute bottom-3 right-3">
              <button
                id="sandbox-run-btn"
                onClick={handleTest}
                disabled={isLoading || !message.trim()}
                className="bg-[#1C1B1B] text-white px-3 py-2 rounded-lg hover:bg-[#333] transition-colors disabled:opacity-50 flex items-center gap-1.5 text-xs font-bold"
              >
                {isLoading ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Play className="w-3.5 h-3.5 fill-white" />
                )}
                Run
              </button>
            </div>
          </div>
        </div>

        {/* Mock Variables Section */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-[#716B67] uppercase tracking-wider flex items-center gap-1.5">
              Mock Variables
              {detectedKeys.length + manualVars.length > 0 && (
                <span className="text-[10px] bg-[#EC5B14]/10 text-[#EC5B14] px-1.5 py-0.5 rounded-full font-sans font-bold">
                  {detectedKeys.length + manualVars.length}
                </span>
              )}
            </label>
            <button
              id="sandbox-vars-toggle"
              type="button"
              onClick={() => setIsVarsExpanded(!isVarsExpanded)}
              className="text-xs font-bold text-[#EC5B14] hover:text-[#d44f0e] flex items-center gap-1 transition-colors"
            >
              {isVarsExpanded ? 'Collapse' : 'Expand'}
              {isVarsExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>

          {isVarsExpanded && (
            <div className="bg-[#F6F3F2] rounded-xl p-4 flex flex-col gap-3.5">
              {detectedKeys.length === 0 && manualVars.length === 0 && (
                <div className="text-xs text-[#A8A4A1] italic flex items-center gap-1.5 py-1">
                  <Info className="w-3.5 h-3.5 shrink-0" />
                  No variables detected. Write {"{{variable}}"} in prompt to test.
                </div>
              )}

              {/* Detected Variables */}
              {detectedKeys.map((key) => (
                <div key={key} className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-mono font-bold text-[#1C1B1B] bg-[#F6F3F2] px-1.5 py-0.5 rounded">{key}</span>
                    <span className="text-[9px] text-[#A8A4A1] font-sans font-bold uppercase tracking-wider">Detected</span>
                  </div>
                  <input
                    type="text"
                    id={`sandbox-var-${key}`}
                    value={variables[key] || ''}
                    onChange={(e) => handleVariableChange(key, e.target.value)}
                    placeholder={`Value for {{${key}}}`}
                    className="w-full border border-[#E8E4E2] rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#EC5B14]/20 focus:border-[#EC5B14] bg-white transition-all text-[#1C1B1B]"
                  />
                </div>
              ))}

              {/* Manual Variables */}
              {manualVars.map((v, index) => (
                <div key={index} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={v.key}
                    onChange={(e) => handleManualVarChange(index, 'key', e.target.value)}
                    placeholder="Key"
                    className="w-[100px] border border-[#E8E4E2] rounded-lg px-2.5 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[#EC5B14]/20 focus:border-[#EC5B14] bg-white transition-all text-[#1C1B1B]"
                  />
                  <input
                    type="text"
                    value={v.value}
                    onChange={(e) => handleManualVarChange(index, 'value', e.target.value)}
                    placeholder="Value"
                    className="flex-1 border border-[#E8E4E2] rounded-lg px-2.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#EC5B14]/20 focus:border-[#EC5B14] bg-white transition-all text-[#1C1B1B]"
                  />
                  <button
                    type="button"
                    onClick={() => removeManualVar(index)}
                    className="text-red-500 hover:text-red-700 p-2 hover:bg-red-50 rounded-lg transition-colors shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}

              <button
                type="button"
                onClick={addManualVar}
                className="mt-1 self-start flex items-center gap-1 text-xs font-bold text-[#EC5B14] hover:text-[#d44f0e] transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Variable
              </button>
            </div>
          )}
        </div>

        {/* Matched Skills List (Only show if we have results) */}
        {result && result.matched_skills && (
          <div className="flex flex-col gap-1.5 bg-white border border-[#E8E4E2] rounded-xl p-3">
            <span className="text-[10px] font-bold text-[#716B67] uppercase tracking-wider flex items-center gap-1">
              <Cpu className="w-3.5 h-3.5 text-[#EC5B14]" />
              Resolved Skills ({result.matched_skills.length})
            </span>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {result.matched_skills.map((skill: any, idx: number) => (
                <div 
                  key={idx} 
                  className={cn(
                    "flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold font-mono border",
                    skill.match_type === 'forced'
                      ? "bg-[#EC5B14]/10 border-[#EC5B14]/30 text-[#EC5B14]"
                      : skill.match_type === 'explicit'
                      ? "bg-blue-50 border-blue-200 text-blue-700"
                      : "bg-emerald-50 border-emerald-200 text-emerald-700"
                  )}
                >
                  <span>{skill.name || skill.id}</span>
                  <span className="opacity-50 text-[9px]">({skill.match_type})</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Output Area */}
        <div className="flex flex-col gap-2 flex-1 min-h-[300px]">
          <div className="flex items-center justify-between shrink-0">
            <label className="text-xs font-bold text-[#716B67] uppercase tracking-wider">Result</label>
            {result && (
              <div className="flex bg-[#E8E4E2] p-0.5 rounded-lg text-[10px] font-bold">
                <button
                  id="sandbox-tab-response"
                  type="button"
                  onClick={() => setActiveTab('response')}
                  className={cn(
                    "px-2.5 py-1 rounded-md transition-colors flex items-center gap-1",
                    activeTab === 'response' ? "bg-white text-[#1C1B1B]" : "text-[#716B67] hover:text-[#1C1B1B]"
                  )}
                >
                  <Eye className="w-3 h-3" />
                  Response
                </button>
                <button
                  id="sandbox-tab-prompt"
                  type="button"
                  onClick={() => setActiveTab('prompt')}
                  className={cn(
                    "px-2.5 py-1 rounded-md transition-colors flex items-center gap-1",
                    activeTab === 'prompt' ? "bg-white text-[#1C1B1B]" : "text-[#716B67] hover:text-[#1C1B1B]"
                  )}
                >
                  <FileText className="w-3 h-3" />
                  Raw Prompt
                </button>
              </div>
            )}
          </div>

          <div className="flex-1 bg-[#1C1B1B] rounded-xl flex flex-col overflow-hidden border border-[#E8E4E2] text-white font-mono text-xs min-h-[260px]">
            {error && (
              <div className="p-4 text-red-400 flex items-start gap-2 overflow-y-auto">
                <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="break-all">{error}</span>
              </div>
            )}
            
            {!error && !result && !isLoading && (
              <div className="text-[#A8A4A1] flex-1 flex h-full items-center justify-center italic">
                Press Run (⌘+Enter) to test skill injection
              </div>
            )}

            {isLoading && (
              <div className="text-[#A8A4A1] flex-1 flex h-full items-center justify-center flex-col gap-3">
                <div className="w-6 h-6 border-2 border-[#EC5B14] border-t-transparent rounded-full animate-spin" />
                <div className="text-xs font-sans font-bold text-[#A8A4A1] animate-pulse">Invoking LLM...</div>
              </div>
            )}

            {!error && result && (
              <div className="flex-1 flex flex-col h-full overflow-hidden">
                <div className="flex-1 p-4 overflow-y-auto whitespace-pre-wrap select-text selection:bg-[#EC5B14]/30 selection:text-white">
                  {activeTab === 'response' ? (
                    <div className="font-sans text-sm leading-relaxed text-[#F6F3F2]">
                      {result.response_text}
                    </div>
                  ) : (
                    <div className="text-emerald-300 text-xs">
                      {highlightPromptTags(result.raw_prompt)}
                    </div>
                  )}
                </div>

                {/* Telemetry/Metrics Bar */}
                <div className="shrink-0 bg-black/40 border-t border-white/5 px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-[10px] text-[#A8A4A1] font-sans">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="flex items-center gap-1 shrink-0" title="Execution Latency">
                      <Clock className="w-3.5 h-3.5 text-[#EC5B14]" />
                      <strong className="text-white font-mono">{result.metrics?.latency_ms}ms</strong>
                    </span>
                    <span className="flex items-center gap-1 shrink-0" title="Token Usage (Prompt / Completion)">
                      <Coins className="w-3.5 h-3.5 text-[#EC5B14]" />
                      <strong className="text-white font-mono">{result.metrics?.total_tokens}t</strong>
                      <span className="text-[9px] text-white/40 font-mono hidden sm:inline">
                        ({result.metrics?.prompt_tokens}/{result.metrics?.completion_tokens})
                      </span>
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-[9px] bg-white/10 px-1.5 py-0.5 rounded text-white font-bold uppercase tracking-wider">PRO TEST</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
