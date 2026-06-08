import React, { useState, useEffect } from 'react';
import { X, AlertCircle, Check, XCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * MCPElicitationDialog 组件
 * 
 * 用于处理 MCP Server 发起的征求（Elicitation）请求。
 * 当 MCP Server 需要额外用户输入时（如参数缺失/不明确），会推送此请求。
 * 
 * 使用示例：
 * ```tsx
 * <MCPElicitationDialog
 *   isOpen={showDialog}
 *   request={{
 *     id: 'elicitation-uuid',
 *     message: '请提供缺陷 ID',
 *     requestedSchema: {
 *       type: 'object',
 *       properties: {
 *         bugId: { type: 'string', description: '缺陷 ID' }
 *       },
 *       required: ['bugId']
 *     },
 *     serverId: 'zentao'
 *   }}
 *   onSubmit={(response) => handleSubmitElicitation(response)}
 *   onClose={() => setShowDialog(false)}
 * />
 * ```
 */

export interface ElicitationRequest {
  id: string;
  message: string;
  requestedSchema: {
    type: string;
    properties: Record<string, {
      type: string;
      description?: string;
      enum?: string[];
      default?: any;
    }>;
    required?: string[];
  };
  serverId: string;
}

export interface ElicitationResponse {
  id: string;
  action: 'submit' | 'cancel' | 'reject';
  content?: Record<string, unknown>;
}

interface MCPElicitationDialogProps {
  isOpen: boolean;
  request: ElicitationRequest | null;
  onSubmit: (response: ElicitationResponse) => void;
  onClose: () => void;
}

/**
 * 根据 JSON Schema 渲染表单字段
 */
function FormField({
  name,
  schema,
  required,
  value,
  onChange,
  error,
}: {
  name: string;
  schema: { type: string; description?: string; enum?: string[]; default?: any };
  required?: boolean;
  value: any;
  onChange: (val: any) => void;
  error?: string;
}) {
  const label = name.charAt(0).toUpperCase() + name.slice(1);

  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
        {schema.description && (
          <span className="text-gray-500 dark:text-gray-400 font-normal ml-2">
            — {schema.description}
          </span>
        )}
      </label>

      {schema.enum ? (
        // 下拉选择
        <select
          value={value ?? schema.default ?? ''}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500"
        >
          {schema.enum.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      ) : schema.type === 'string' ? (
        // 文本输入
        <input
          type="text"
          value={value ?? schema.default ?? ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`请输入 ${label}`}
          className={`w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 ${
            error ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
          }`}
        />
      ) : schema.type === 'number' || schema.type === 'integer' ? (
        // 数字输入
        <input
          type="number"
          value={value ?? schema.default ?? ''}
          onChange={(e) => onChange(Number(e.target.value))}
          placeholder={`请输入 ${label}`}
          className={`w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 ${
            error ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
          }`}
        />
      ) : schema.type === 'boolean' ? (
        // 布尔开关
        <label className="flex items-center space-x-2">
          <input
            type="checkbox"
            checked={value ?? schema.default ?? false}
            onChange={(e) => onChange(e.target.checked)}
            className="h-4 w-4 text-blue-600 border-gray-300 rounded"
          />
          <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
        </label>
      ) : null}

      {error && (
        <p className="text-red-500 text-xs mt-1">{error}</p>
      )}
    </div>
  );
}

export const MCPElicitationDialog: React.FC<MCPElicitationDialogProps> = ({
  isOpen,
  request,
  onSubmit,
  onClose,
}) => {
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  // 当请求变化时重置表单
  useEffect(() => {
    if (request) {
      const initialData: Record<string, unknown> = {};
      Object.entries(request.requestedSchema.properties).forEach(([key, prop]) => {
        if (prop.default !== undefined) {
          initialData[key] = prop.default;
        }
      });
      setFormData(initialData);
      setErrors({});
    }
  }, [request]);

  if (!isOpen || !request) return null;

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    const required = request.requestedSchema.required || [];

    required.forEach((field) => {
      if (!formData[field] && formData[field] !== false && formData[field] !== 0) {
        newErrors[field] = `${field} 是必填项`;
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (validate()) {
      onSubmit({
        id: request.id,
        action: 'submit',
        content: formData,
      });
      onClose();
    }
  };

  const handleCancel = () => {
    onSubmit({
      id: request.id,
      action: 'cancel',
    });
    onClose();
  };

  const handleReject = () => {
    onSubmit({
      id: request.id,
      action: 'reject',
    });
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={handleCancel}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-lg w-full mx-4 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-2">
                <AlertCircle className="h-5 w-5 text-blue-600" />
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  MCP Server 请求补充信息
                </h3>
              </div>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Server Badge */}
            <div className="mb-4">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                {request.serverId}
              </span>
            </div>

            {/* Message */}
            <p className="text-gray-700 dark:text-gray-300 mb-6">
              {request.message}
            </p>

            {/* Form */}
            <div className="space-y-4 mb-6">
              {Object.entries(request.requestedSchema.properties).map(([key, prop]) => (
                <FormField
                  key={key}
                  name={key}
                  schema={prop}
                  required={request.requestedSchema.required?.includes(key)}
                  value={formData[key]}
                  onChange={(val) => setFormData((prev) => ({ ...prev, [key]: val }))}
                  error={errors[key]}
                />
              ))}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end space-x-3">
              <button
                onClick={handleReject}
                className="flex items-center px-4 py-2 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50 rounded-lg transition-colors"
              >
                <XCircle className="h-4 w-4 mr-1.5" />
                拒绝
              </button>
              <button
                onClick={handleCancel}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSubmit}
                className="flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
              >
                <Check className="h-4 w-4 mr-1.5" />
                提交
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
