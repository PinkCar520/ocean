import { Bug, AlertTriangle, Clock, CheckCircle2, Users2, Rocket, Check, Loader2, ChevronUp, ChevronDown as ChevronDownIcon, X, Download, ExternalLink } from 'lucide-react';
import { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { cn, fixZenTaoFileUrl, formatFileSize, getFileExtension, isImageFile, getFileIconInfo } from '../lib/utils';
import type { UIAttachment, UIBugCardProps } from '../types/ui-protocol';

export type { UIBugCardProps, UIAttachment };

export interface BugCardProps extends UIBugCardProps {
  onClick?: (bugId: string) => void;
  onAction?: (action: string, data: Record<string, unknown>) => void;
}

/**
 * 图片预览 Modal（内联）
 */
function ImagePreviewModal({
  attachment,
  onClose,
}: {
  attachment: UIAttachment;
  onClose: () => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    setLoaded(false);
    setError(false);
  }, [attachment.url]);

  // ESC 关闭
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative max-w-[90vw] max-h-[90vh] flex flex-col items-center"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 关闭按钮 */}
        <button
          onClick={onClose}
          className="absolute -top-10 right-0 text-white/80 hover:text-white transition-colors"
        >
          <X className="w-6 h-6" />
        </button>

        {/* 图片 */}
        {!loaded && !error && (
          <div className="flex items-center justify-center w-[300px] h-[200px] text-white/60">
            <Loader2 className="w-8 h-8 animate-spin" />
          </div>
        )}
        {error && (
          <div className="flex flex-col items-center justify-center w-[300px] h-[200px] text-white/60 gap-2">
            <Bug className="w-10 h-10" />
            <span className="text-sm">图片加载失败</span>
          </div>
        )}
        <img
          src={fixZenTaoFileUrl(attachment.url)}
          alt={attachment.name || 'Preview'}
          className={cn(
            'max-w-full max-h-[85vh] rounded-xl object-contain shadow-2xl',
            loaded ? 'block' : 'hidden',
          )}
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
        />

        {/* 底部信息栏 */}
        <div className="mt-3 flex items-center gap-3 text-white/70 text-xs">
          <span className="truncate max-w-[200px]">{attachment.name}</span>
          {attachment.size && <span>{formatFileSize(attachment.size)}</span>}
          <a
            href={fixZenTaoFileUrl(attachment.url)}
            download={attachment.name}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 hover:text-white transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            <Download className="w-3.5 h-3.5" /> 下载
          </a>
        </div>
      </div>
    </div>
  );
}

/**
 * 单个附件卡片（文档类）
 */
function DocumentAttachmentCard({ attachment }: { attachment: UIAttachment }) {
  const ext = getFileExtension(attachment.name || '');
  const iconInfo = getFileIconInfo(attachment.extension || ext);
  const Icon = iconInfo.icon;

  return (
    <a
      href={fixZenTaoFileUrl(attachment.url)}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-[#E8E4E2] bg-white hover:bg-[#F6F3F2] transition-colors group"
    >
      {/* 图标 */}
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
        style={{ backgroundColor: `${iconInfo.color}15`, color: iconInfo.color }}
      >
        <Icon className="w-4 h-4" />
      </div>

      {/* 文件名 + 大小 */}
      <div className="flex-1 min-w-0">
        <div className="text-[12px] font-medium text-[#1C1B1B] truncate">{attachment.name || '未命名文件'}</div>
        <div className="flex items-center gap-2 text-[10px] text-[#716B67]">
          <span className="font-bold uppercase tracking-wider" style={{ color: iconInfo.color }}>
            {iconInfo.label}
          </span>
          {attachment.size && <span>· {formatFileSize(attachment.size)}</span>}
        </div>
      </div>

      {/* 打开图标 */}
      <ExternalLink className="w-3.5 h-3.5 text-[#716B67] opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
    </a>
  );
}

export function BugCard({
  id,
  title,
  status,
  assignee,
  severity,
  description,
  createdAt,
  attachments,
  onAction,
}: BugCardProps) {
  const { t } = useTranslation();
  const [actionState, setActionState] = useState<'idle' | 'loading' | 'success'>('idle');
  const [descExpanded, setDescExpanded] = useState(false);
  const [previewImage, setPreviewImage] = useState<UIAttachment | null>(null);

  const normalizedStatus = (status ?? '').toLowerCase() as UIBugCardProps['status'];
  const normalizedSeverity = (severity ?? '').toLowerCase() as UIBugCardProps['severity'];

  const severityColors: Record<string, string> = {
    high: 'border-[#F43F5E] bg-[#F43F5E]/5 text-[#DC2626]',
    medium: 'border-[#F59E0B] bg-[#F59E0B]/5 text-[#D97706]',
    low: 'border-[#10B981] bg-[#10B981]/5 text-[#059669]',
  };

  const statusIcons: Record<string, React.JSX.Element> = {
    active: <Clock className="w-3.5 h-3.5 text-[#F59E0B]" />,
    resolved: <CheckCircle2 className="w-3.5 h-3.5 text-[#10B981]" />,
    closed: <CheckCircle2 className="w-3.5 h-3.5 text-[#716B67]" />,
  };

  const formattedDate = createdAt
    ? new Date(createdAt).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
    : null;

  const cleanDescription = description
    ? description.replace(/<[^>]*>/g, '').replace(/&nbsp;/gi, ' ').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').trim()
    : null;

  // 判断描述是否过长需要折叠
  const isLongDescription = cleanDescription && cleanDescription.length > 200;
  const displayDescription = cleanDescription
    ? (isLongDescription && !descExpanded ? cleanDescription.slice(0, 200) + '...' : cleanDescription)
    : null;

  // 分离图片和文档
  const imageAttachments = attachments?.filter(a => isImageFile(a.contentType, a.extension)) || [];
  const documentAttachments = attachments?.filter(a => !isImageFile(a.contentType, a.extension)) || [];
  const hasAttachments = attachments && attachments.length > 0;

  const handleAction = () => {
    setActionState('loading');
    onAction?.('create_zentao_task', {
      bugId: id,
      assignee: assignee || '',
      title: title,
    });
    setTimeout(() => setActionState('success'), 800);
  };

  const handlePreview = useCallback((attachment: UIAttachment) => {
    setPreviewImage(attachment);
  }, []);

  const handleClosePreview = useCallback(() => {
    setPreviewImage(null);
  }, []);

  return (
    <div className="bg-white border border-[#E8E4E2] rounded-[20px] overflow-hidden shadow-[0_8px_30px_rgba(0,0,0,0.04)] mt-2">
      {/* Header */}
      <div className="px-6 pt-5 pb-4 border-b border-[#E8E4E2]/60">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <div className="bg-blue-50 p-1.5 rounded-lg">
              <Bug className="w-4 h-4 text-blue-600" />
            </div>
            <span className="text-[10px] font-bold text-[#716B67] uppercase tracking-[0.15em]">{id}</span>
          </div>
          <div className={cn(
            "flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold border uppercase",
            severityColors[normalizedSeverity] || severityColors.medium
          )}>
            <AlertTriangle className="w-3 h-3" />
            {t(`bug.severity.${normalizedSeverity}`, normalizedSeverity)}
          </div>
        </div>
        <h3 className="text-[16px] font-bold text-[#1C1B1B] mt-2 leading-snug">{title}</h3>
      </div>

      {/* Description */}
      {cleanDescription && (
        <div className="px-6 py-4">
          <div className="text-[13px] text-[#716B67] leading-relaxed whitespace-pre-wrap bg-[#F6F3F2] p-4 rounded-[14px]">
            {displayDescription}
          </div>
          {isLongDescription && (
            <button
              onClick={() => setDescExpanded(!descExpanded)}
              className="mt-2 text-[11px] font-bold text-[#EC5B14] hover:underline flex items-center gap-1"
            >
              {descExpanded ? (
                <><ChevronUp className="w-3 h-3" />收起</>
              ) : (
                <><ChevronDownIcon className="w-3 h-3" />展开全文</>
              )}
            </button>
          )}
        </div>
      )}

      {/* Attachments */}
      {hasAttachments && (
        <div className="px-6 pb-2">
          {/* 图片附件 */}
          {imageAttachments.length > 0 && (
            <div className="mb-3">
              <label className="text-[10px] font-bold text-[#716B67] uppercase tracking-[0.15em] mb-2 block">
                附图 ({imageAttachments.length})
              </label>
              <div className="grid grid-cols-2 gap-2">
                {imageAttachments.map((img, idx) => (
                  <button
                    key={idx}
                    onClick={() => handlePreview(img)}
                    className="rounded-[10px] overflow-hidden border border-[#E8E4E2] bg-[#F6F3F2] relative group cursor-pointer hover:border-[#EC5B14]/40 transition-colors"
                  >
                    <img
                      src={fixZenTaoFileUrl(img.url)}
                      alt={img.name || `Attachment ${idx + 1}`}
                      className="w-full h-24 object-cover"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                        const parent = target.parentElement;
                        if (parent && !parent.querySelector('.placeholder')) {
                          const placeholder = document.createElement('div');
                          placeholder.className = 'placeholder flex flex-col items-center justify-center h-24 text-[#716B67]/50';
                          placeholder.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg><span class="text-[10px] mt-1">${img.name || 'Image'}</span>`;
                          parent.appendChild(placeholder);
                        }
                      }}
                    />
                    {/* Hover overlay */}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 text-white text-[10px] font-bold px-2 py-1 rounded-full">
                        点击查看
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 文档附件 */}
          {documentAttachments.length > 0 && (
            <div>
              <label className="text-[10px] font-bold text-[#716B67] uppercase tracking-[0.15em] mb-2 block">
                附件 ({documentAttachments.length})
              </label>
              <div className="space-y-2">
                {documentAttachments.map((doc, idx) => (
                  <DocumentAttachmentCard key={idx} attachment={doc} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Interactive Body */}
      <div className="px-6 py-4 space-y-4">
        {/* Assignee */}
        {assignee && (
          <div>
            <label className="text-[10px] font-bold text-[#716B67] uppercase tracking-[0.15em] mb-2 block">
              Assignee
            </label>
            <div className="flex items-center gap-2.5 bg-[#F6F3F2] rounded-[10px] px-4 py-2.5 border border-[#E8E4E2]">
              <div className="w-7 h-7 rounded-full bg-white flex items-center justify-center border border-[#E8E4E2]">
                <Users2 className="w-3.5 h-3.5 text-[#716B67]" />
              </div>
              <span className="text-[13px] font-medium text-[#1C1B1B]">{assignee}</span>
            </div>
          </div>
        )}

        {/* Status + Date */}
        <div className="flex items-center justify-between pt-2 border-t border-[#E8E4E2]/60">
          <div className="flex items-center gap-2">
            {statusIcons[normalizedStatus]}
            <span className="text-[11px] font-bold text-[#716B67] capitalize">
              {t(`bug.status.${normalizedStatus}`, normalizedStatus)}
            </span>
          </div>
          {formattedDate && (
            <span className="text-[11px] text-[#716B67]/70">{formattedDate}</span>
          )}
        </div>
      </div>

      {/* CTA Button */}
      <div className="px-6 pb-6">
        <button
          onClick={handleAction}
          disabled={actionState === 'success'}
          className={cn(
            'w-full py-3.5 rounded-[16px] font-bold text-[14px] transition-all duration-200 flex items-center justify-center gap-2 border',
            actionState === 'idle' && 'bg-gradient-to-br from-[#a33800] to-[#cc4900] text-white border-0 shadow-[0_8px_24px_rgba(163,56,0,0.35)] hover:shadow-[0_12px_32px_rgba(163,56,0,0.45)] hover:from-[#c24200] hover:to-[#e65200] active:scale-[0.98]',
            actionState === 'loading' && 'bg-[#F6F3F2] text-[#716B67] border-[#E8E4E2] cursor-wait',
            actionState === 'success' && 'bg-[#10B981]/10 text-[#059669] border-[#10B981]/30 cursor-default'
          )}
        >
          {actionState === 'idle' && <><Rocket className="w-4 h-4" />Create Task &amp; Sync to ZenTao</>}
          {actionState === 'loading' && <><Loader2 className="w-4 h-4 animate-spin" />Creating...</>}
          {actionState === 'success' && <><Check className="w-4 h-4" />Task Created</>}
        </button>
      </div>

      {/* Image Preview Modal */}
      {previewImage && (
        <ImagePreviewModal attachment={previewImage} onClose={handleClosePreview} />
      )}
    </div>
  );
}
