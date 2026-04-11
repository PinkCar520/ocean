import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { FileText, FileImage, FileSpreadsheet, File, Archive, Code2, FileAudio, FileVideo } from 'lucide-react';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * 修复禅道文件 URL
 * 禅道返回的相对路径如 index.php?m=file&f=read&t=png&fileID=1
 * 需要通过后端代理或转换为完整 URL
 */
export function fixZenTaoFileUrl(url: string, baseUrl?: string): string {
  // 如果已经是完整 URL 或 data URL，直接返回
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
    return url;
  }

  // 如果是相对路径，拼接 baseUrl
  if (baseUrl) {
    const base = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
    return base + url;
  }

  // 否则通过我们的代理端点
  return `/api/proxy/file?url=${encodeURIComponent(url)}`;
}

/**
 * 向后兼容别名
 */
export const fixZenTaoImageUrl = fixZenTaoFileUrl;

/**
 * 格式化文件大小（字节 → 人类可读）
 */
export function formatFileSize(bytes: number | undefined | null): string {
  if (!bytes || bytes === 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(size < 10 ? 1 : 0)} ${units[unitIndex]}`;
}

/**
 * 获取文件扩展名
 */
export function getFileExtension(filename: string): string {
  const parts = filename.split('.');
  return parts.length > 1 ? parts.pop()?.toLowerCase() || '' : '';
}

/**
 * 判断是否为图片类型
 */
export function isImageFile(contentType?: string, extension?: string): boolean {
  if (contentType?.startsWith('image/')) return true;
  const ext = extension?.toLowerCase() || '';
  return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'ico', 'avif'].includes(ext);
}

/**
 * 根据扩展名获取文件图标组件和颜色
 */
export function getFileIconInfo(extension?: string): { icon: React.ComponentType<{ className?: string }>; color: string; label: string } {
  const ext = extension?.toLowerCase() || '';

  const iconMap: Record<string, { icon: React.ComponentType<{ className?: string }>; color: string; label: string }> = {
    // 图片
    png: { icon: FileImage, color: '#8B5CF6', label: 'PNG' },
    jpg: { icon: FileImage, color: '#8B5CF6', label: 'JPG' },
    jpeg: { icon: FileImage, color: '#8B5CF6', label: 'JPEG' },
    gif: { icon: FileImage, color: '#8B5CF6', label: 'GIF' },
    webp: { icon: FileImage, color: '#8B5CF6', label: 'WebP' },
    bmp: { icon: FileImage, color: '#8B5CF6', label: 'BMP' },
    svg: { icon: FileImage, color: '#8B5CF6', label: 'SVG' },
    // 文档
    pdf: { icon: FileText, color: '#EF4444', label: 'PDF' },
    doc: { icon: FileText, color: '#3B82F6', label: 'DOC' },
    docx: { icon: FileText, color: '#3B82F6', label: 'DOCX' },
    txt: { icon: FileText, color: '#6B7280', label: 'TXT' },
    // 表格
    xls: { icon: FileSpreadsheet, color: '#10B981', label: 'XLS' },
    xlsx: { icon: FileSpreadsheet, color: '#10B981', label: 'XLSX' },
    csv: { icon: FileSpreadsheet, color: '#10B981', label: 'CSV' },
    // 演示文稿
    ppt: { icon: FileText, color: '#F59E0B', label: 'PPT' },
    pptx: { icon: FileText, color: '#F59E0B', label: 'PPTX' },
    // 压缩包
    zip: { icon: Archive, color: '#6B7280', label: 'ZIP' },
    rar: { icon: Archive, color: '#6B7280', label: 'RAR' },
    '7z': { icon: Archive, color: '#6B7280', label: '7Z' },
    // 代码
    json: { icon: Code2, color: '#F59E0B', label: 'JSON' },
    xml: { icon: Code2, color: '#6B7280', label: 'XML' },
    js: { icon: Code2, color: '#FBBF24', label: 'JS' },
    ts: { icon: Code2, color: '#3B82F6', label: 'TS' },
    html: { icon: Code2, color: '#EF4444', label: 'HTML' },
    css: { icon: Code2, color: '#8B5CF6', label: 'CSS' },
    // 音视频
    mp3: { icon: FileAudio, color: '#EC4899', label: 'MP3' },
    wav: { icon: FileAudio, color: '#EC4899', label: 'WAV' },
    mp4: { icon: FileVideo, color: '#EC4899', label: 'MP4' },
    avi: { icon: FileVideo, color: '#EC4899', label: 'AVI' },
  };

  return iconMap[ext] || { icon: File, color: '#6B7280', label: ext.toUpperCase() || 'FILE' };
}
