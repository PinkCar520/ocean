import { Controller, Get, Query, Res, Req, Headers } from '@nestjs/common';
import { Response, Request } from 'express';
import * as path from 'path';

/**
 * 通用文件代理控制器
 * 用于代理禅道等外部服务的文件资源（图片、文档等）
 * 解决跨域和认证问题
 */
@Controller('proxy')
export class ProxyController {
  /**
   * 通用文件代理（推荐）
   * 支持所有文件类型：图片、文档、压缩包等
   * GET /api/proxy/file?url=...&filename=...
   */
  @Get('file')
  async proxyFile(
    @Query('url') fileUrl: string,
    @Query('filename') filename: string | undefined,
    @Headers('x-zentao-token') zentaoToken: string | undefined,
    @Res() res: Response,
  ) {
    if (!fileUrl) {
      return res.status(400).json({ error: 'Missing url parameter' });
    }

    try {
      const headers: Record<string, string> = {};
      if (zentaoToken) {
        headers['Token'] = zentaoToken;
      }

      const response = await fetch(fileUrl, { headers });

      if (!response.ok) {
        return res.status(response.status).json({ error: `Failed to fetch: ${response.statusText}` });
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      let contentType = response.headers.get('content-type') || 'application/octet-stream';

      // 根据文件扩展名推断 Content-Type（禅道有时不返回正确的类型）
      const urlPath = new URL(fileUrl, 'http://dummy').pathname;
      const ext = path.extname(urlPath).toLowerCase();
      const mimeMap: Record<string, string> = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.bmp': 'image/bmp',
        '.svg': 'image/svg+xml',
        '.pdf': 'application/pdf',
        '.doc': 'application/msword',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.xls': 'application/vnd.ms-excel',
        '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        '.ppt': 'application/vnd.ms-powerpoint',
        '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        '.txt': 'text/plain',
        '.zip': 'application/zip',
        '.rar': 'application/x-rar-compressed',
        '.csv': 'text/csv',
      };
      if (mimeMap[ext]) {
        contentType = mimeMap[ext];
      }

      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=3600');

      // 设置 Content-Disposition 让浏览器下载/预览
      const displayName = filename || urlPath.split('/').pop() || 'file';
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(displayName)}"`);

      return res.send(buffer);
    } catch (error: any) {
      console.error(`[Proxy] Failed to fetch file: ${fileUrl}`, error.message);
      return res.status(502).json({
        error: 'Failed to fetch file',
        message: error.message,
      });
    }
  }

  /**
   * 图片代理（向后兼容）
   * GET /api/proxy/image?url=...
   */
  @Get('image')
  async proxyImage(@Query('url') imageUrl: string, @Res() res: Response) {
    return this.proxyFile(imageUrl, undefined, undefined, res);
  }
}
