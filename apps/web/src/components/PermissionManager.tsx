import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield, Plus, Trash2, Save, RotateCcw, Eye, EyeOff,
  CheckCircle2, XCircle, AlertCircle, Lock, Unlock,
  Settings2, Info, Play, Ban, HelpCircle
} from 'lucide-react';
import { cn } from '../lib/utils';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

type PermissionAction = 'allow' | 'deny' | 'ask';
type PermissionMode = 'default' | 'acceptEdits' | 'plan' | 'bypassPermissions';

interface PermissionRule {
  action: PermissionAction;
  pattern: string;
  comment?: string;
}

interface PermissionSettings {
  mode: PermissionMode;
  maxMcpOutputTokens: number;
  rules: PermissionRule[];
  allow: string[];
  deny: string[];
  ask: string[];
}

const DEFAULT_SETTINGS: PermissionSettings = {
  mode: 'default',
  maxMcpOutputTokens: 25000,
  rules: [],
  allow: [],
  deny: [],
  ask: [],
};

const MODE_CONFIG: Record<PermissionMode, { label: string; icon: React.ReactNode; color: string; description: string }> = {
  default: {
    label: 'Default',
    icon: <HelpCircle className="w-4 h-4" />,
    color: 'text-blue-600',
    description: '首次使用时提示用户确认',
  },
  acceptEdits: {
    label: 'Accept Edits',
    icon: <Unlock className="w-4 h-4" />,
    color: 'text-green-600',
    description: '自动批准文件编辑，仅提示 Bash 命令',
  },
  plan: {
    label: 'Plan Only',
    icon: <Eye className="w-4 h-4" />,
    color: 'text-amber-600',
    description: '只读模式，不执行任何写操作',
  },
  bypassPermissions: {
    label: 'Bypass (CI/CD)',
    icon: <Play className="w-4 h-4" />,
    color: 'text-purple-600',
    description: '完全跳过审批，适用于 CI/CD 环境',
  },
};

const ACTION_COLORS: Record<PermissionAction, { bg: string; text: string; icon: React.ReactNode }> = {
  allow: {
    bg: 'bg-green-50',
    text: 'text-green-700',
    icon: <CheckCircle2 className="w-3.5 h-3.5" />,
  },
  deny: {
    bg: 'bg-red-50',
    text: 'text-red-700',
    icon: <Ban className="w-3.5 h-3.5" />,
  },
  ask: {
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    icon: <AlertCircle className="w-3.5 h-3.5" />,
  },
};

// ──────────────────────────────────────────────
// Main Component
// ──────────────────────────────────────────────

export function PermissionManager() {
  const [settings, setSettings] = useState<PermissionSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingRule, setEditingRule] = useState<number | null>(null);
  const [newRule, setNewRule] = useState<PermissionRule>({ action: 'ask', pattern: '', comment: '' });
  const [showNewRuleForm, setShowNewRuleForm] = useState(false);
  const [testTool, setTestTool] = useState('');
  const [testResult, setTestResult] = useState<PermissionAction | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/permissions/settings');
      if (!res.ok) throw new Error('Failed to fetch settings');
      const data = await res.json();
      setSettings({
        mode: data.mode || 'default',
        maxMcpOutputTokens: data.maxMcpOutputTokens || 25000,
        rules: data.rules || [],
        allow: data.allow || [],
        deny: data.deny || [],
        ask: data.ask || [],
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/permissions/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (!res.ok) throw new Error('Failed to save settings');
      await fetchSettings();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const testEvaluate = async () => {
    if (!testTool.trim()) return;
    try {
      const res = await fetch(`/api/permissions/evaluate?toolName=${encodeURIComponent(testTool)}`);
      const data = await res.json();
      setTestResult(data.action);
    } catch {
      setTestResult(null);
    }
  };

  const addRule = () => {
    if (!newRule.pattern.trim()) return;
    setSettings({ ...settings, rules: [...settings.rules, { ...newRule }] });
    setNewRule({ action: 'ask', pattern: '', comment: '' });
    setShowNewRuleForm(false);
  };

  const removeRule = (index: number) => {
    setSettings({ ...settings, rules: settings.rules.filter((_, i) => i !== index) });
  };

  const updateRule = (index: number, updates: Partial<PermissionRule>) => {
    setSettings({
      ...settings,
      rules: settings.rules.map((r, i) => (i === index ? { ...r, ...updates } : r)),
    });
  };

  const addPatternToCategory = (category: 'allow' | 'deny' | 'ask', pattern: string) => {
    if (!pattern.trim()) return;
    setSettings({ ...settings, [category]: [...(settings[category] as string[]), pattern] });
  };

  const removePatternFromCategory = (category: 'allow' | 'deny' | 'ask', index: number) => {
    setSettings({
      ...settings,
      [category]: (settings[category] as string[]).filter((_, i) => i !== index),
    });
  };

  // ──────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-[#716B67]">Loading permissions...</div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold tracking-tight text-[#1C1B1B] flex items-center gap-2">
            <Shield className="w-5 h-5 text-[#EC5B14]" />
            Permission Settings
          </h3>
          <p className="text-[#716B67] text-sm mt-1">
            Claude Code 兼容的权限规则配置
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchSettings}
            className="px-3 py-2 text-sm font-semibold text-[#716B67] bg-white border border-[#E8E4E2]/50 rounded-xl hover:bg-[#F6F3F2] transition-all"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            onClick={saveSettings}
            disabled={saving}
            className="px-4 py-2 text-sm font-bold text-white bg-[#EC5B14] rounded-xl hover:bg-[#D84E0F] transition-all disabled:opacity-50 flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-center gap-2">
          <XCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      {/* Mode Selection */}
      <section className="bg-white border border-[#E8E4E2]/50 rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-2 mb-4">
          <Settings2 className="w-4 h-4 text-[#EC5B14]" />
          <h4 className="font-bold text-[#1C1B1B]">Permission Mode</h4>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {(['default', 'acceptEdits', 'plan', 'bypassPermissions'] as PermissionMode[]).map((mode) => {
            const config = MODE_CONFIG[mode];
            const isActive = settings.mode === mode;
            return (
              <button
                key={mode}
                onClick={() => setSettings({ ...settings, mode })}
                className={cn(
                  'p-4 rounded-xl border-2 text-left transition-all',
                  isActive
                    ? 'border-[#EC5B14] bg-[#FFF5F0] shadow-sm'
                    : 'border-[#E8E4E2]/50 bg-white hover:border-[#EC5B14]/30'
                )}
              >
                <div className={cn('flex items-center gap-2 mb-1', config.color)}>
                  {config.icon}
                  <span className="font-bold text-sm">{config.label}</span>
                </div>
                <p className="text-xs text-[#716B67]">{config.description}</p>
              </button>
            );
          })}
        </div>
      </section>

      {/* Max MCP Output Tokens */}
      <section className="bg-white border border-[#E8E4E2]/50 rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Info className="w-4 h-4 text-[#EC5B14]" />
          <h4 className="font-bold text-[#1C1B1B]">MCP Output Token Limit</h4>
        </div>
        <div className="flex items-center gap-4">
          <input
            type="number"
            value={settings.maxMcpOutputTokens}
            onChange={(e) => setSettings({ ...settings, maxMcpOutputTokens: Number(e.target.value) })}
            className="w-32 px-3 py-2 border border-[#E8E4E2]/50 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#EC5B14]/30"
          />
          <span className="text-xs text-[#716B67]">
            防止 MCP 工具响应过大导致上下文溢出（推荐 25000）
          </span>
        </div>
      </section>

      {/* Category Patterns (allow/deny/ask shorthand) */}
      <section className="bg-white border border-[#E8E4E2]/50 rounded-2xl p-6 space-y-4">
        <h4 className="font-bold text-[#1C1B1B]">Quick Patterns (allow / deny / ask)</h4>
        <p className="text-xs text-[#716B67]">Simple pattern lists. Evaluated in order: deny → allow → ask → rules.</p>

        {(['allow', 'deny', 'ask'] as const).map((category) => (
          <CategoryPatternList
            key={category}
            category={category}
            patterns={settings[category] as string[]}
            onAdd={(p) => addPatternToCategory(category, p)}
            onRemove={(i) => removePatternFromCategory(category, i)}
          />
        ))}
      </section>

      {/* Detailed Rules */}
      <section className="bg-white border border-[#E8E4E2]/50 rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-bold text-[#1C1B1B]">Detailed Rules</h4>
            <p className="text-xs text-[#716B67]">Evaluated top-down, first match wins. Supports wildcards: *, ?</p>
          </div>
          <button
            onClick={() => setShowNewRuleForm(true)}
            className="px-3 py-1.5 text-sm font-semibold text-[#EC5B14] border border-[#EC5B14]/30 rounded-lg hover:bg-[#FFF5F0] transition-all flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Rule
          </button>
        </div>

        {showNewRuleForm && (
          <div className="flex gap-2 items-end p-4 bg-[#F6F3F2] rounded-xl">
            <div className="flex-1 space-y-1">
              <label className="text-xs font-semibold text-[#716B67]">Action</label>
              <select
                value={newRule.action}
                onChange={(e) => setNewRule({ ...newRule, action: e.target.value as PermissionAction })}
                className="w-full px-3 py-2 border border-[#E8E4E2]/50 rounded-lg text-sm"
              >
                <option value="allow">Allow</option>
                <option value="deny">Deny</option>
                <option value="ask">Ask</option>
              </select>
            </div>
            <div className="flex-[2] space-y-1">
              <label className="text-xs font-semibold text-[#716B67]">Pattern</label>
              <input
                value={newRule.pattern}
                onChange={(e) => setNewRule({ ...newRule, pattern: e.target.value })}
                placeholder="e.g. mcp__zentao:*, Bash(git:*)"
                className="w-full px-3 py-2 border border-[#E8E4E2]/50 rounded-lg text-sm font-mono"
              />
            </div>
            <div className="flex-[2] space-y-1">
              <label className="text-xs font-semibold text-[#716B67]">Comment (optional)</label>
              <input
                value={newRule.comment || ''}
                onChange={(e) => setNewRule({ ...newRule, comment: e.target.value })}
                placeholder="Description..."
                className="w-full px-3 py-2 border border-[#E8E4E2]/50 rounded-lg text-sm"
              />
            </div>
            <button onClick={addRule} className="px-3 py-2 bg-[#EC5B14] text-white rounded-lg text-sm font-bold">
              Add
            </button>
            <button onClick={() => setShowNewRuleForm(false)} className="px-3 py-2 text-[#716B67] text-sm">
              Cancel
            </button>
          </div>
        )}

        {settings.rules.length === 0 && !showNewRuleForm && (
          <div className="text-center py-8 text-[#716B67] text-sm">No detailed rules configured yet.</div>
        )}

        <div className="space-y-2">
          {settings.rules.map((rule, index) => (
            <div key={index} className="flex items-center gap-3 p-3 bg-[#F6F3F2] rounded-xl">
              {editingRule === index ? (
                <>
                  <select
                    value={rule.action}
                    onChange={(e) => updateRule(index, { action: e.target.value as PermissionAction })}
                    className="px-2 py-1 border rounded text-sm"
                  >
                    <option value="allow">Allow</option>
                    <option value="deny">Deny</option>
                    <option value="ask">Ask</option>
                  </select>
                  <input
                    value={rule.pattern}
                    onChange={(e) => updateRule(index, { pattern: e.target.value })}
                    className="flex-1 px-2 py-1 border rounded text-sm font-mono"
                  />
                  <button
                    onClick={() => setEditingRule(null)}
                    className="px-2 py-1 bg-green-600 text-white rounded text-xs font-bold"
                  >
                    ✓
                  </button>
                </>
              ) : (
                <>
                  <span className={cn('px-2 py-1 rounded text-xs font-bold flex items-center gap-1', ACTION_COLORS[rule.action].bg, ACTION_COLORS[rule.action].text)}>
                    {ACTION_COLORS[rule.action].icon}
                    {rule.action.toUpperCase()}
                  </span>
                  <code className="flex-1 text-sm font-mono text-[#1C1B1B]">{rule.pattern}</code>
                  {rule.comment && <span className="text-xs text-[#716B67] max-w-[200px] truncate">{rule.comment}</span>}
                  <button onClick={() => setEditingRule(index)} className="text-[#716B67] hover:text-[#EC5B14]">
                    <Settings2 className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => removeRule(index)} className="text-red-400 hover:text-red-600">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Test Tool Evaluation */}
      <section className="bg-white border border-[#E8E4E2]/50 rounded-2xl p-6 space-y-4">
        <h4 className="font-bold text-[#1C1B1B] flex items-center gap-2">
          <Shield className="w-4 h-4 text-[#EC5B14]" />
          Test Tool Evaluation
        </h4>
        <div className="flex gap-2 items-end">
          <div className="flex-1 space-y-1">
            <label className="text-xs font-semibold text-[#716B67]">Tool Name</label>
            <input
              value={testTool}
              onChange={(e) => { setTestTool(e.target.value); setTestResult(null); }}
              onKeyDown={(e) => e.key === 'Enter' && testEvaluate()}
              placeholder="e.g. getBugInfo, mcp__zentao:createProduct"
              className="w-full px-3 py-2 border border-[#E8E4E2]/50 rounded-lg text-sm font-mono"
            />
          </div>
          <button
            onClick={testEvaluate}
            className="px-4 py-2 bg-[#EC5B14] text-white rounded-lg text-sm font-bold hover:bg-[#D84E0F] transition-all"
          >
            Evaluate
          </button>
        </div>

        {testResult && (
          <div className={cn(
            'p-4 rounded-xl flex items-center gap-3',
            testResult === 'allow' && 'bg-green-50 text-green-700',
            testResult === 'deny' && 'bg-red-50 text-red-700',
            testResult === 'ask' && 'bg-amber-50 text-amber-700',
          )}>
            {testResult === 'allow' && <CheckCircle2 className="w-5 h-5" />}
            {testResult === 'deny' && <XCircle className="w-5 h-5" />}
            {testResult === 'ask' && <AlertCircle className="w-5 h-5" />}
            <span className="font-bold">
              Tool &quot;{testTool}&quot; → {testResult.toUpperCase()}
            </span>
          </div>
        )}
      </section>
    </div>
  );
}

// ──────────────────────────────────────────────
// Sub-Component: Category Pattern List
// ──────────────────────────────────────────────

function CategoryPatternList({
  category,
  patterns,
  onAdd,
  onRemove,
}: {
  category: 'allow' | 'deny' | 'ask';
  patterns: string[];
  onAdd: (pattern: string) => void;
  onRemove: (index: number) => void;
}) {
  const [input, setInput] = useState('');
  const config = ACTION_COLORS[category];

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className={cn('px-2 py-0.5 rounded text-xs font-bold flex items-center gap-1', config.bg, config.text)}>
          {config.icon}
          {category.toUpperCase()}
        </span>
      </div>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && input.trim()) {
              onAdd(input.trim());
              setInput('');
            }
          }}
          placeholder="Enter pattern and press Enter..."
          className="flex-1 px-3 py-2 border border-[#E8E4E2]/50 rounded-lg text-sm font-mono"
        />
        <button
          onClick={() => { if (input.trim()) { onAdd(input.trim()); setInput(''); } }}
          className="px-3 py-2 text-sm font-bold text-[#EC5B14] border border-[#EC5B14]/30 rounded-lg hover:bg-[#FFF5F0]"
        >
          Add
        </button>
      </div>
      {patterns.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {patterns.map((p, i) => (
            <span
              key={i}
              className={cn(
                'px-2.5 py-1 rounded-lg text-xs font-mono flex items-center gap-1.5',
                config.bg, config.text
              )}
            >
              {p}
              <button onClick={() => onRemove(i)} className="hover:opacity-70">
                <XCircle className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
