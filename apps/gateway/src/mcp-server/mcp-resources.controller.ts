import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { MCPClientManager } from '../mcp/mcp-client.manager';
import { MCPConfigWatcher } from '../mcp/mcp-config.watcher';
import type { MCPPrompt, MCPResource, MCPResourceContents, MCPElicitationResponse } from '../mcp/mcp.types';
import type { GetPromptResult } from '@modelcontextprotocol/sdk/types.js';

/**
 * MCP Resources & Prompts 控制器
 * 
 * 提供 MCP 协议核心能力的 REST API：
 * - Resources: 只读数据资源管理
 * - Prompts: 预定义提示词模板
 * - Elicitation: 用户交互征求
 */
@Controller('api/mcp')
export class MCPResourcesController {
  constructor(
    private readonly mcpManager: MCPClientManager,
    private readonly configWatcher: MCPConfigWatcher,
  ) {}

  // ──────────────────────────────────────────────
  // Resources API
  // ──────────────────────────────────────────────

  /**
   * GET /api/mcp/resources
   * 获取所有 MCP Server 的资源列表
   */
  @Get('resources')
  async listResources(): Promise<{ success: boolean; data: MCPResource[] }> {
    const resources = await this.mcpManager.listResources();
    return { success: true, data: resources };
  }

  /**
   * GET /api/mcp/resource-templates
   * 获取所有资源模板列表
   */
  @Get('resource-templates')
  async listResourceTemplates(): Promise<{ success: boolean; data: any[] }> {
    const templates = await this.mcpManager.listResourceTemplates();
    return { success: true, data: templates };
  }

  /**
   * GET /api/mcp/resources/read
   * 读取指定资源的内容
   * Query: uri (必需), serverId (可选)
   */
  @Get('resources/read')
  async readResource(
    @Query('uri') uri: string,
    @Query('serverId') serverId?: string,
  ): Promise<{ success: boolean; data: MCPResourceContents | null }> {
    const content = await this.mcpManager.readResource(uri, serverId);
    return { success: true, data: content };
  }

  // ──────────────────────────────────────────────
  // Prompts API
  // ──────────────────────────────────────────────

  /**
   * GET /api/mcp/prompts
   * 获取所有提示词模板列表
   */
  @Get('prompts')
  async listPrompts(): Promise<{ success: boolean; data: MCPPrompt[] }> {
    const prompts = await this.mcpManager.listPrompts();
    return { success: true, data: prompts };
  }

  /**
   * POST /api/mcp/prompts/:name
   * 获取指定提示词的完整内容（含变量填充）
   * Body: { args?: Record<string, string>, serverId?: string }
   */
  @Post('prompts/:name')
  @HttpCode(HttpStatus.OK)
  async getPrompt(
    @Param('name') name: string,
    @Body() body: { args?: Record<string, string>; serverId?: string },
  ): Promise<{ success: boolean; data: GetPromptResult | null; error?: string }> {
    const prompt = await this.mcpManager.getPrompt(name, body.args, body.serverId);
    if (!prompt) {
      return { success: false, data: null, error: `Prompt not found: ${name}` };
    }
    return { success: true, data: prompt };
  }

  // ──────────────────────────────────────────────
  // Elicitation API
  // ──────────────────────────────────────────────

  /**
   * GET /api/mcp/elicitations
   * 获取待处理的征求请求列表
   */
  @Get('elicitations')
  async getPendingElicitations(): Promise<{ success: boolean; data: any[] }> {
    const elicitations = this.mcpManager.getPendingElicitations();
    return { success: true, data: elicitations };
  }

  /**
   * POST /api/mcp/elicitations/:id
   * 提交征求响应
   * Body: { action: 'submit' | 'cancel' | 'reject', content?: Record<string, unknown> }
   */
  @Post('elicitations/:id')
  @HttpCode(HttpStatus.OK)
  async submitElicitationResponse(
    @Param('id') id: string,
    @Body() body: Omit<MCPElicitationResponse, 'id'>,
  ): Promise<{ success: boolean }> {
    await this.mcpManager.submitElicitationResponse({
      id,
      ...body,
    });
    return { success: true };
  }

  // ──────────────────────────────────────────────
  // Server Management API (热加载)
  // ──────────────────────────────────────────────

  /**
   * POST /api/mcp/servers/:id/reconnect
   * 重连指定 MCP Server
   */
  @Post('servers/:id/reconnect')
  @HttpCode(HttpStatus.OK)
  async reconnectServer(@Param('id') id: string): Promise<{ success: boolean }> {
    await this.mcpManager.reconnectServer(id);
    return { success: true };
  }

  /**
   * POST /api/mcp/servers/:id/disconnect
   * 断开指定 MCP Server
   */
  @Post('servers/:id/disconnect')
  @HttpCode(HttpStatus.OK)
  async disconnectServer(@Param('id') id: string): Promise<{ success: boolean }> {
    await this.mcpManager.disconnectServer(id);
    return { success: true };
  }

  /**
   * POST /api/mcp/config/reload
   * 手动触发配置文件重载
   */
  @Post('config/reload')
  @HttpCode(HttpStatus.OK)
  async reloadConfig(): Promise<{ success: boolean; data: { added: number; removed: number } }> {
    const result = await this.configWatcher.reloadConfigManually();
    return { success: true, data: result };
  }
}
