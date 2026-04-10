import { Controller, Get, Post, Put, Delete, Param, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { MCPServerService, CreateMCPServerDto, UpdateMCPServerDto } from './mcp-server.service';

@Controller('api/mcp-servers')
export class MCPServerController {
  constructor(private readonly mcpServerService: MCPServerService) {}

  /**
   * GET /api/mcp-servers
   * 获取 MCP Server 列表
   */
  @Get()
  async getServers(@Body() body?: { category?: string; enabled?: boolean }) {
    const servers = await this.mcpServerService.getServers(body);
    return { success: true, data: servers };
  }

  /**
   * GET /api/mcp-servers/:id
   * 获取单个 MCP Server
   */
  @Get(':id')
  async getServer(@Param('id') id: string) {
    const server = await this.mcpServerService.getServerById(id);
    return { success: true, data: server };
  }

  /**
   * GET /api/mcp-servers/:id/health
   * 健康检查
   */
  @Get(':id/health')
  async checkHealth(@Param('id') id: string) {
    const result = await this.mcpServerService.checkHealth(id);
    return { success: true, data: result };
  }

  /**
   * POST /api/mcp-servers/health/all
   * 批量健康检查
   */
  @Post('health/all')
  async checkAllHealth() {
    const statuses = await this.mcpServerService.checkAllServers();
    return { success: true, data: statuses };
  }

  /**
   * POST /api/mcp-servers/sync
   * 从 mcp.config.json 同步到数据库
   */
  @Post('sync')
  async syncFromConfig() {
    const result = await this.mcpServerService.syncFromConfig();
    return { success: true, data: result };
  }

  /**
   * POST /api/mcp-servers
   * 创建 MCP Server
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createServer(@Body() body: CreateMCPServerDto) {
    const server = await this.mcpServerService.createServer(body);
    return { success: true, data: server };
  }

  /**
   * PUT /api/mcp-servers/:id
   * 更新 MCP Server
   */
  @Put(':id')
  async updateServer(@Param('id') id: string, @Body() body: UpdateMCPServerDto) {
    const server = await this.mcpServerService.updateServer(id, body);
    return { success: true, data: server };
  }

  /**
   * DELETE /api/mcp-servers/:id
   * 删除 MCP Server
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async deleteServer(@Param('id') id: string) {
    await this.mcpServerService.deleteServer(id);
    return { success: true };
  }
}
