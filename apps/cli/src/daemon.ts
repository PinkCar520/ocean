import { io } from 'socket.io-client';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import inquirer from 'inquirer';
import chalk from 'chalk';
import type { RPCMessage } from '@ocean/core';
import { resolveApiKey, getAutoUserId } from './utils/auth.js';
import { CONFIG, LOG } from './utils/config.js';
import { security } from './utils/security.js';

import { FileEditTool } from './tools/local/file-edit.js';
import { GitTool } from './tools/local/git.js';
import { PlanTool } from './tools/local/plan.js';
import { createPowerShellTool } from './tools/powershell.js';
import { TaskManager } from './utils/task-manager.js';
import { createNotebookRpc } from './tools/notebook-rpc.js';

const execAsync = promisify(exec);

// Initialize tool instances
const tools = {
  fileEdit: new FileEditTool(),
  git: new GitTool(),
  plan: new PlanTool(),
};
const powerShellTool = createPowerShellTool();

interface DaemonOptions {
  userId: string;
}

export async function runDaemon(options: DaemonOptions) {
  let effectiveUserId = process.env.OCEAN_WORK_ID || process.env.OCEAN_USER_ID || options.userId;
  const apiKey = await resolveApiKey();
  const notebookRpc = createNotebookRpc(process.cwd());

  console.log(chalk.green(LOG.DAEMON) + ` Identity: ${chalk.bold(effectiveUserId)}`);
  console.log(chalk.green(LOG.DAEMON) + ` Connecting to Gateway (${CONFIG.GATEWAY_URL})...`);

  const socket = io(CONFIG.GATEWAY_URL, {
    query: { clientType: 'cli' },
    auth: { token: apiKey || undefined },
    transports: ['websocket'], // 强制使用 WebSocket，跳过轮询升级
    extraHeaders: apiKey ? {
      'x-api-key': apiKey,
      'Authorization': `Bearer ${apiKey}`,
    } : {},
  });

  // Track the current session ID for background sync
  let currentSessionId: string | null = null;

  // TaskManager Observer: Sync events to Gateway
  TaskManager.subscribe((event) => {
    if (currentSessionId) {
      socket.emit(event.type, {
        ...event.data,
        sessionId: currentSessionId
      });
    }
  });

  socket.on('connect', () => {
    console.log(chalk.gray('[Ocean Daemon] Connected; authenticating...'));
  });
  socket.on('rpc_identity', (identity: { workId?: unknown }) => {
    if (typeof identity?.workId === 'string' && identity.workId) {
      effectiveUserId = identity.workId;
      console.log(chalk.green('✓ [SUCCESS]') + ` Connected as node: ${effectiveUserId}`);
    }
  });
  socket.on('rpc_auth_error', (error: { message?: string }) => console.error(chalk.red('[Authentication]'), error.message || 'Gateway authentication failed.'));

  socket.on('rpc_request', async (data: RPCMessage) => {
    console.log(chalk.cyan(LOG.RPC) + ` ID: ${data.id}, Method: ${data.method}`);

    let result: any = null;
    let error: string | null = null;
    let uiHint: string = 'text';
    let resolvedTargetPath: string | undefined;

    try {
      const { sessionId } = data.params || {};
      if (sessionId) currentSessionId = sessionId;

      // 1. Path Security Check
      const targetPath = data.params?.path || data.params?.dir || data.params?.cwd;
      if (targetPath) {
        resolvedTargetPath = await security.resolveWorkspacePath(targetPath);
      }

      // 2. Dispatch to New Atomic Tools or Legacy Switch
      switch (data.method) {
        case 'notebook_read':
        case 'notebook_edit':
        case 'file_read':
        case 'file_write':
        case 'file_edit':
        case 'file_patch':
          result = await notebookRpc(data.method, data.params || {}, effectiveUserId);
          uiHint = ['notebook_edit', 'file_write', 'file_edit', 'file_patch'].includes(data.method) ? 'diff' : 'code';
          break;

        case 'create_local_project':
          const { name, category } = data.params;
          const safeName = name.replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, '_');
          const baseDir = path.join(os.homedir(), 'Documents', 'Ocean');
          const projectPath = path.join(baseDir, safeName);

          // 1. 创建文件夹
          await fs.mkdir(projectPath, { recursive: true });

          // 2. 初始化 .AIGUIDE.md (业务指令)
          const guidePath = path.join(projectPath, '.AIGUIDE.md');
          const guideContent = `# ${name} - AI 业务规范\n\n## 任务上下文\n项目类型: ${category}\n创建时间: ${new Date().toLocaleString()}\n\n## 编排指令\n- 始终优先读取本项目文件夹下的原始资料。\n- 在执行任何修改前，先进行合规性检查。`;
          
          try {
            await fs.access(guidePath); // 检查是否已存在
          } catch {
            await fs.writeFile(guidePath, guideContent);
          }

          result = { path: projectPath };
          uiHint = 'text';
          console.log(chalk.green('[Success]') + ` Created local project space at: ${projectPath}`);
          break;

        case 'local_file_edit':
          const editRes = await tools.fileEdit.execute(data.params);
          if (!editRes.success) throw new Error(editRes.error);
          result = editRes.data;
          uiHint = editRes.uiHint || 'diff';
          break;

        case 'local_git':
        case 'git_status':
        case 'git_add':
        case 'git_commit':
        case 'git_push':
          // 统一路由到 GitTool
          const gitAction = data.method === 'local_git' ? data.params?.action : data.method.replace('git_', '');
          const gitRes = await tools.git.execute({ ...data.params, action: gitAction });
          if (!gitRes.success) throw new Error(gitRes.error);
          result = gitRes.data;
          uiHint = gitRes.uiHint || 'git';
          break;

        case 'local_plan':
        case 'plan_start':
        case 'task_update':
          const planAction = data.method === 'local_plan' ? data.params?.action : data.method.replace('plan_', '').replace('task_', '');
          const planRes = await tools.plan.execute({ ...data.params, action: planAction });
          if (!planRes.success) throw new Error(planRes.error);
          result = planRes.data;
          uiHint = planRes.uiHint || 'tree';
          break;

        // Legacy / Standard methods
        case 'ls':
          result = await fs.readdir(resolvedTargetPath || process.cwd());
          uiHint = 'tree';
          break;
        case 'read_file':
          if (!data.params?.path) throw new Error('Path required');
          result = await fs.readFile(
            await security.resolveReadablePath(data.params.path),
            'utf-8',
          );
          uiHint = 'code';
          break;
        case 'bash':
          if (!data.params?.command) throw new Error('Command required');
          // Audit Bash
          const audit = security.auditCommand(data.params.command);
          if (!audit.allowed) throw new Error(`Command Denied: ${audit.reason}`);
          
          if (audit.riskLevel === 'HIGH') {
            console.log(chalk.yellow('[Security]') + ` High risk command detected: ${data.params.command}`);
          }
          
          const { stdout, stderr } = await execAsync(data.params.command, {
            cwd: resolvedTargetPath || process.cwd(),
            timeout: 120_000,
            maxBuffer: 5 * 1024 * 1024,
            env: { 
              ...process.env, 
              GIT_TERMINAL_PROMPT: '0',
            }
          });
          result = stdout || stderr;
          break;

        case 'powershell': {
          if (!data.params?.command) throw new Error('PowerShell command required');
          const execution = await powerShellTool.execute({
            command: data.params.command,
            cwd: resolvedTargetPath,
            timeout_ms: data.params.timeout_ms,
          }, {
            cwd: process.cwd(),
            userId: effectiveUserId,
            sessionId: sessionId || 'daemon',
          });
          if (execution.error) throw new Error(execution.error);
          result = execution.data;
          uiHint = 'code';
          break;
        }

        default:
          result = `Method ${data.method} not implemented.`;
      }
    } catch (err: any) {
      console.error(chalk.red('[RPC Error]'), err.message);
      error = err.message;
    }

    socket.emit('rpc_response', {
      id: data.id,
      result,
      error,
      metadata: { uiHint }
    });
  });

  socket.on('disconnect', () => console.log(chalk.red('✗ Disconnected.')));
  socket.on('connect_error', (err) => console.error(chalk.red('✗ Connection Error:'), err.message));

  await new Promise(() => {});
}
