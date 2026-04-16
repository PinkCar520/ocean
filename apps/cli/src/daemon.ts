import { io } from 'socket.io-client';
import * as fs from 'node:fs/promises';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import inquirer from 'inquirer';
import chalk from 'chalk';
import type { RPCMessage } from '@uclaw/core';
import { resolveApiKey, getAutoUserId } from './utils/auth.js';
import { CONFIG, LOG } from './utils/config.js';
import { security } from './utils/security.js';

import { FileEditTool } from './tools/local/file-edit.js';
import { GitTool } from './tools/local/git.js';
import { PlanTool } from './tools/local/plan.js';
import { TaskManager } from './utils/task-manager.js';

const execAsync = promisify(exec);

// Initialize tool instances
const tools = {
  fileEdit: new FileEditTool(),
  git: new GitTool(),
  plan: new PlanTool(),
};

interface DaemonOptions {
  userId: string;
}

export async function runDaemon(options: DaemonOptions) {
  const effectiveUserId = process.env.UCLAW_WORK_ID || process.env.UCLAW_USER_ID || options.userId;
  const apiKey = await resolveApiKey();

  console.log(chalk.green(LOG.DAEMON) + ` Identity: ${chalk.bold(effectiveUserId)}`);
  console.log(chalk.green(LOG.DAEMON) + ` Connecting to Gateway (${CONFIG.GATEWAY_URL})...`);

  const socket = io(CONFIG.GATEWAY_URL, {
    query: { userId: effectiveUserId },
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
    console.log(chalk.green('✓ [SUCCESS]') + ` Connected as node: ${effectiveUserId}`);
  });

  socket.on('rpc_request', async (data: RPCMessage) => {
    console.log(chalk.cyan(LOG.RPC) + ` ID: ${data.id}, Method: ${data.method}`);

    let result: any = null;
    let error: string | null = null;
    let uiHint: string = 'text';

    try {
      const { sessionId } = data.params || {};
      if (sessionId) currentSessionId = sessionId;

      // 1. Path Security Check
      const targetPath = data.params?.path || data.params?.dir;
      if (targetPath) {
        const { isValid } = security.validatePath(targetPath);
        if (!isValid) throw new Error(`Security Violation: Path "${targetPath}" is outside workspace.`);
      }

      // 2. Dispatch to New Atomic Tools or Legacy Switch
      switch (data.method) {
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
          result = await fs.readdir(process.cwd());
          uiHint = 'tree';
          break;
        case 'read_file':
          if (!data.params?.path) throw new Error('Path required');
          result = await fs.readFile(data.params.path, 'utf-8');
          uiHint = 'code';
          break;
        case 'bash':
          if (!data.params?.command) throw new Error('Command required');
          // Audit Bash
          const audit = security.auditCommand(data.params.command);
          if (!audit.allowed) throw new Error(`Command Denied: ${audit.reason}`);
          
          if (audit.riskLevel === 'HIGH') {
            let confirmed = false;
            
            if (sessionId) {
              // Remote Approval via Gateway -> Web UI
              console.log(chalk.yellow('[Security]') + ` High risk command detected. Requesting remote approval via session ${sessionId}...`);
              confirmed = await new Promise((resolve) => {
                socket.emit('request_approval', { 
                  sessionId, 
                  toolName: 'bash', 
                  args: { command: data.params.command } 
                });
                
                const onResolved = (res: any) => {
                  if (res.error) {
                    console.error(chalk.red('[Approval Error]'), res.error);
                    resolve(false);
                  } else {
                    resolve(res.approved);
                  }
                };
                
                socket.once('approval_resolved', onResolved);
                // 5 minute timeout for remote approval
                setTimeout(() => {
                  socket.off('approval_resolved', onResolved);
                  resolve(false);
                }, 300000);
              });
            } else {
              // Local Fallback (Terminal Prompt)
              const response = await inquirer.prompt([{
                type: 'confirm',
                name: 'confirmed',
                message: `[Security] Authorize "${data.params.command}"?`,
                default: false,
              }]);
              confirmed = response.confirmed;
            }
            
            if (!confirmed) throw new Error('Denied by user.');
            console.log(chalk.green('✓ [APPROVED]') + ` Executing: ${data.params.command}`);
          }
          
          const { stdout, stderr } = await execAsync(data.params.command);
          result = stdout || stderr;
          break;

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
