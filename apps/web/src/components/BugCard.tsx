import { Bug, User, AlertTriangle, CheckCircle2, Clock, Image as ImageIcon, ChevronDown, ChevronUp } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../lib/utils';
import type { UIBugCardProps } from '../types/ui-protocol';

export type { UIBugCardProps };

export interface BugCardProps extends UIBugCardProps {
  onClick?: (bugId: string) => void;
}

/** 格式化 HTML 描述，转换为纯文本并保留换行 */
function formatDescription(html: string): string {
  if (!html) return '';
  // 1. 处理块级标签，转换为换行
  let text = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<\/li>/gi, '\n');
  
  // 2. 去除其他所有标签
  text = text.replace(/<[^>]*>/g, '');
  
  // 3. 处理实体字符
  text = text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");

  // 4. 合并连续多余空行，去除首尾空白
  return text.trim().replace(/\n{3,}/g, '\n\n');
}

/** 从 HTML 中提取图片地址 */
function extractImages(html: string): string[] {
  if (!html) return [];
  const imgRegex = /<img[^>]+src="([^">]+)"/gi;
  const images: string[] = [];
  let match;
  while ((match = imgRegex.exec(html)) !== null) {
    images.push(match[1]);
  }
  return images;
}

export function BugCard({
  id,
  title,
  status,
  assignee,
  severity,
  description,
  createdAt,
  onClick,
}: BugCardProps) {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);

  // 统一转为小写，兼容 API 返回的大写值
  const normalizedStatus = (status ?? '').toLowerCase() as UIBugCardProps['status'];
  const normalizedSeverity = (severity ?? '').toLowerCase() as UIBugCardProps['severity'];

  const severityColors: Record<string, string> = {
    high: 'text-rose-600 border-rose-200 bg-rose-50',
    medium: 'text-amber-600 border-amber-200 bg-amber-50',
    low: 'text-emerald-600 border-emerald-200 bg-emerald-50',
  };

  const statusIcons: Record<string, ReactElement> = {
    active: <Clock className="w-3.5 h-3.5 text-rose-500" />,
    resolved: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />,
    closed: <CheckCircle2 className="w-3.5 h-3.5 text-slate-400" />,
  };

  const formattedDate = createdAt
    ? new Date(createdAt).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
    : null;

  // 清理描述中的 HTML 标签，保留换行
  const cleanDescription = description ? formatDescription(description) : null;
  
  // 提取图片
  const imageUrls = description ? extractImages(description) : [];
  const hasImages = imageUrls.length > 0;
  
  // 检测描述中是否包含图片引用关键字（如果没有实际 <img> 标签但也提到了图片）
  const mentionsImages = !hasImages && (description?.toLowerCase().includes('图片') || description?.toLowerCase().includes('image'));

  return (
    <div
      className={cn(
        "group relative bg-white border border-slate-200 rounded-2xl p-5 transition-all hover:shadow-md hover:shadow-slate-100 hover:border-blue-200 overflow-hidden",
        onClick && "cursor-pointer"
      )}
      onClick={() => onClick?.(id)}
    >

      {/* 顶部 ID 与 严重程度 */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="bg-blue-50 p-1.5 rounded-lg border border-blue-100">
            <Bug className="w-3.5 h-3.5 text-blue-600" />
          </div>
          <span className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">{id}</span>
        </div>
        <div className={cn(
          "flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold border uppercase tracking-tight",
          severityColors[normalizedSeverity] || severityColors.medium
        )}>
          <AlertTriangle className="w-3 h-3" />
          {t(`bug.severity.${normalizedSeverity}`, normalizedSeverity)}
        </div>
      </div>

      {/* 标题 */}
      <h3 className="text-[14px] font-bold text-slate-800 mb-3 leading-snug group-hover:text-blue-600 transition-colors">
        {title}
      </h3>

      {/* 描述摘要（带展开/收起） */}
      {cleanDescription && (
        <div className="relative mb-4">
          <div className={cn(
            "text-[12px] text-slate-600 leading-relaxed whitespace-pre-wrap bg-slate-50/80 p-3.5 rounded-xl border border-slate-100 transition-all duration-200",
            !isExpanded && "line-clamp-4 overflow-hidden"
          )}>
            {cleanDescription}
          </div>
          {cleanDescription.split('\n').length > 4 || cleanDescription.length > 150 ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsExpanded(!isExpanded);
              }}
              className="mt-1.5 flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:text-blue-700 transition-colors px-1"
            >
              {isExpanded ? (
                <>
                  <ChevronUp className="w-3 h-3" />
                  {t('common.show_less', '收起')}
                </>
              ) : (
                <>
                  <ChevronDown className="w-3 h-3" />
                  {t('common.show_more', '展开全文')}
                </>
              )}
            </button>
          ) : null}
        </div>
      )}

      {/* 图片展示 */}
      {hasImages && (
        <div className="flex flex-wrap gap-2 mb-4">
          {imageUrls.map((url, index) => (
            <div key={index} className="relative group/img aspect-video rounded-xl overflow-hidden border border-slate-200 bg-slate-50 min-w-[120px] max-w-[240px] flex-1">
              <img 
                src={url} 
                alt={`Attachment ${index + 1}`} 
                className="w-full h-full object-cover transition-transform duration-300 group-hover/img:scale-105"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = 'https://placehold.co/400x225/f1f5f9/94a3b8?text=Image+Load+Error';
                }}
              />
            </div>
          ))}
        </div>
      )}

      {/* 图片占位提示（如果只有文字引用而无实际标签） */}
      {mentionsImages && (
        <div className="flex items-center gap-2 mb-4 p-3 rounded-xl bg-blue-50/50 border border-blue-100 text-[11px] text-blue-600">
          <ImageIcon className="w-4 h-4 shrink-0" />
          <span>{t('bug.has_screenshot', '此缺陷包含截图，点击卡片查看详情')}</span>
        </div>
      )}

      {/* 底部元数据 */}
      <div className="flex items-center justify-between pt-4 border-t border-slate-100">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center border border-slate-200">
            <User className="w-3.5 h-3.5 text-slate-500" />
          </div>
          <span className="text-[11px] font-bold text-slate-600">{assignee}</span>
        </div>
        <div className="flex items-center gap-2.5">
          {formattedDate && (
            <span className="text-[10px] text-slate-400">{formattedDate}</span>
          )}
          {statusIcons[normalizedStatus]}
          <span className="text-[11px] font-bold text-slate-500">
            {t(`bug.status.${normalizedStatus}`, normalizedStatus)}
          </span>
        </div>
      </div>
    </div>
  );
}
