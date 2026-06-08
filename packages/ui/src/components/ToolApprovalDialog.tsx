import React, { useState } from 'react';
import { Shield, Check, X, AlertTriangle, CheckCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * ToolApprovalDialog 组件
 * 
 * 用于工具调用审批。当 MCP 工具需要用户确认时弹出。
 * 
 * 使用示例：
 * ```tsx
 * <ToolApprovalDialog
 *   isOpen={showApproval}
 *   request={{
 *     toolName: 'resolveBug',
 *     args: { bugId: '123', resolution: 'fixed' },
 *     serverId: 'zentao',
 *     description: '将缺陷 #123 标记为已解决',
 *   }}
 *   onApprove={() => handleApprove()}
 *   onReject={() => handleReject()}
 *   onAlwaysTrust={() => handleAlwaysTrust('resolveBug')}
 * />
 * ```
 */

export interface ToolApprovalRequest {
  toolName: string;
  args: Record<string, unknown>;
  serverId: string;
  description?: string;
  riskLevel?: 'low' | 'medium' | 'high';
}

interface ToolApprovalDialogProps {
  isOpen: boolean;
  request: ToolApprovalRequest | null;
  onApprove: () => void;
  onReject: () => void;
  onAlwaysTrust?: (toolName: string) => void;
}

const riskConfig = {
  low: {
    label: '低风险',
    color: 'text-green-600 bg-green-50 dark:bg-green-900/30 dark:text-green-400',
    icon: <CheckCircle className="h-3 w-3" />,
  },
  medium: {
    label: '中风险',
    color: 'text-yellow-600 bg-yellow-50 dark:bg-yellow-900/30 dark:text-yellow-400',
    icon: <AlertTriangle className="h-3 w-3" />,
  },
  high: {
    label: '高风险',
    color: 'text-red-600 bg-red-50 dark:bg-red-900/30 dark:text-red-400',
    icon: <AlertTriangle className="h-3 w-3" />,
  },
};

export const ToolApprovalDialog: React.FC<ToolApprovalDialogProps> = ({
  isOpen,
  request,
  onApprove,
  onReject,
  onAlwaysTrust,
}) => {
  const [alwaysTrust, setAlwaysTrust] = useState(false);

  if (!isOpen || !request) return null;

  const handleApprove = () => {
    if (alwaysTrust && onAlwaysTrust) {
      onAlwaysTrust(request.toolName);
    }
    onApprove();
  };

  const riskLevel = request.riskLevel || 'medium';
  const risk = riskConfig[riskLevel];

  // 格式化参数为可读文本
  const formatArgs = (args: Record<string, unknown>): string => {
    return Object.entries(args)
      .map(([key, val]) => {
        const displayVal = typeof val === 'object' ? JSON.stringify(val, null, 2) : String(val);
        return `${key}: ${displayVal}`;
      })
      .join('\n');
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={onReject}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-6 pb-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-2">
                  <div className="p-2 bg-blue-100 dark:bg-blue-900/50 rounded-lg">
                    <Shield className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    工具调用审批
                  </h3>
                </div>
              </div>

              {/* Server & Risk Badges */}
              <div className="flex items-center space-x-2 mb-3">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300">
                  {request.serverId}
                </span>
                <span className={`inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${risk.color}`}>
                  {risk.icon}
                  <span>{risk.label}</span>
                </span>
              </div>

              {/* Tool Name & Description */}
              <div className="mb-4">
                <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-1">
                  {request.toolName}
                </h4>
                {request.description && (
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {request.description}
                  </p>
                )}
              </div>

              {/* Args Preview */}
              <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3 mb-4">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
                  调用参数：
                </p>
                <pre className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-mono">
                  {formatArgs(request.args)}
                </pre>
              </div>

              {/* Always Trust Checkbox */}
              {onAlwaysTrust && (
                <label className="flex items-center space-x-2 mb-2">
                  <input
                    type="checkbox"
                    checked={alwaysTrust}
                    onChange={(e) => setAlwaysTrust(e.target.checked)}
                    className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    始终信任此工具（不再询问）
                  </span>
                </label>
              )}
            </div>

            {/* Actions */}
            <div className="px-6 py-4 bg-gray-50 dark:bg-gray-900/50 rounded-b-xl flex items-center justify-end space-x-3">
              <button
                onClick={onReject}
                className="flex items-center px-4 py-2 text-sm font-medium text-red-600 bg-white border border-red-200 hover:bg-red-50 dark:bg-gray-800 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-900/30 rounded-lg transition-colors"
              >
                <X className="h-4 w-4 mr-1.5" />
                拒绝
              </button>
              <button
                onClick={handleApprove}
                className="flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
              >
                <Check className="h-4 w-4 mr-1.5" />
                允许
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
