import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
} from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { PermissionService } from './permission.service';
import { PermissionSettings, PermissionMode } from './permission.types';

const PERMISSION_MODES: PermissionMode[] = [
  'default',
  'acceptEdits',
  'plan',
  'dontAsk',
  'bypassPermissions',
];

@Controller('api/permissions')
export class PermissionController {
  constructor(private readonly permissionService: PermissionService) {}

  /**
   * GET /api/permissions/settings
   * Get current loaded permission settings.
   */
  @Get('settings')
  getSettings(@Query('workspacePath') workspacePath?: string) {
    const settings = this.permissionService.loadSettings(workspacePath);
    const rules = this.permissionService.getRules(workspacePath);

    return {
      mode: settings.mode,
      maxMcpOutputTokens: settings.maxMcpOutputTokens,
      rules: rules.map((r) => ({
        action: r.action,
        pattern: r.pattern,
        skill: r.skill,
        comment: r.comment,
      })),
    };
  }

  /**
   * GET /api/permissions/evaluate
   * Evaluate a specific tool against current rules.
   * Query params: toolName (required), workspacePath (optional)
   */
  @Get('evaluate')
  evaluateTool(
    @Query('toolName') toolName: string,
    @Query('workspacePath') workspacePath?: string,
  ) {
    if (!toolName) {
      return { error: 'toolName query parameter is required' };
    }

    const decision = this.permissionService.evaluateToolDecision(
      toolName,
      workspacePath,
      null,
    );
    return {
      toolName,
      action: decision.action,
      reason: decision.reason,
      ruleId: decision.ruleId,
      policyVersion: decision.policyVersion,
      source: decision.source,
      isAllowed: decision.action === 'allow',
      isDenied: decision.action === 'deny',
      requiresApproval: decision.action === 'ask',
    };
  }

  /**
   * POST /api/permissions/settings
   * Save settings.json to the workspace .ocean directory.
   */
  @Post('settings')
  saveSettings(
    @Body() patch: PermissionSettings,
    @Query('workspacePath') workspacePath?: string,
  ) {
    const targetDir = workspacePath
      ? path.join(workspacePath, '.ocean')
      : path.join(process.cwd(), '.ocean');

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    if (patch.mode && !PERMISSION_MODES.includes(patch.mode)) {
      throw new BadRequestException(`Invalid permission mode: ${patch.mode}`);
    }

    // The mode picker sends a partial update. Preserve project/user rules instead
    // of replacing the complete policy with an empty rules array.
    const current = this.permissionService.loadSettings(workspacePath);
    const settings: PermissionSettings = { ...current, ...patch };
    const filePath = path.join(targetDir, 'settings.json');
    fs.writeFileSync(filePath, JSON.stringify(settings, null, 2), 'utf-8');
    this.permissionService.invalidateCache();

    return { success: true, path: filePath, settings };
  }

  /**
   * GET /api/permissions/mode
   * Get current permission mode.
   */
  @Get('mode')
  getMode(@Query('workspacePath') workspacePath?: string) {
    return { mode: this.permissionService.getMode(workspacePath) };
  }
}
