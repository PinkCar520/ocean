#!/usr/bin/env node

/**
 * UClaw CLI - Entry Point
 * 
 * Dual mode:
 * - `uclaw <command>` - Single command execution
 * - `uclaw` (no args) - Interactive REPL mode
 */

import { Command } from 'commander';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import * as dotenv from 'dotenv';
import chalk from 'chalk';

// ESM __dirname replacement
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env
// dist/index.js is at apps/cli/dist, .env is at project root
// Need to go up 3 levels: dist -> cli -> apps -> project-root
const envRoot = path.resolve(__dirname, '../../..');
const envResult1 = dotenv.config({ path: path.join(envRoot, '.env'), override: true });
const envResult2 = dotenv.config({ path: path.resolve(process.cwd(), '.env'), override: true });

// Sanity check - always print, not just when DEBUG
console.log(`[dotenv debug] __dirname=${__dirname}`);
console.log(`[dotenv debug] envRoot=${envRoot}`);
console.log(`[dotenv debug] envResult1 parsed keys=${Object.keys(envResult1.parsed || {}).length}`);
console.log(`[dotenv debug] VLLM_API_BASE=${process.env.VLLM_API_BASE || '(undefined)'}`);
console.log(`[dotenv debug] DASHSCOPE_API_BASE=${process.env.DASHSCOPE_API_BASE || '(undefined)'}`);

const execAsync = promisify(exec);

// Import submodules (will be created)
import { runRepl } from './repl.js';
import { runDaemon } from './daemon.js';

const program = new Command();

program
  .name('uclaw')
  .description('UClaw AI Workstream Terminal Node')
  .version('1.0.0');

// ─── Default: REPL Mode ──────────────────────────────────────
program
  .argument('[query]', 'Direct query (exits after answering)')
  .option('-m, --model <model>', 'Model to use')
  .option('-w, --workspace <path>', 'Workspace directory', process.cwd())
  .option('-u, --user <userId>', 'User ID')
  .action(async (query, options) => {
    const userId = options.user || await getAutoUserId();
    const workspace = path.resolve(options.workspace);

    if (query) {
      // Single query mode - non-interactive
      console.log(chalk.cyan(`[UClaw] Query: ${query}`));
      console.log(chalk.cyan(`[UClaw] User: ${userId}`));
      console.log(chalk.cyan(`[UClaw] Workspace: ${workspace}\n`));
      await runRepl({ userId, workspace, singleQuery: query });
    } else {
      // Interactive REPL
      console.log(chalk.bold('\n🐼 UClaw Terminal AI'));
      console.log(chalk.gray(`User: ${userId} | Workspace: ${workspace}`));
      console.log(chalk.gray('Type your question or use /help for commands\n'));
      await runRepl({ userId, workspace });
    }
  });

// ─── Daemon Mode ─────────────────────────────────────────────
program
  .command('daemon')
  .description('Start persistent UClaw node daemon to await commands from Gateway')
  .option('-u, --user <userId>', 'User ID for identity binding (default: auto-detected)')
  .action(async (options) => {
    const userId = options.user || await getAutoUserId();
    await runDaemon({ userId });
  });

// ─── Legacy: Start Command ───────────────────────────────────
program
  .command('start')
  .description('Start UClaw interaction pointing to a task/bug')
  .argument('[task_id]', 'ID of the ZenTao or GitLab task')
  .action(async (taskId) => {
    const userId = await getAutoUserId();
    const workspace = process.cwd();

    if (taskId) {
      console.log(chalk.cyan(`[UClaw] Fetching ZenTao context for: ${taskId}...`));
      console.log(chalk.cyan(`[UClaw] User: ${userId}\n`));
      await runRepl({
        userId,
        workspace,
        singleQuery: `帮我查看禅道缺陷 ${taskId} 的详情并分析如何修复`
      });
    } else {
      console.log(chalk.cyan('[UClaw] Initializing general analysis...\n'));
      await runRepl({ userId, workspace });
    }
  });

// ─── Helpers ─────────────────────────────────────────────────
async function getAutoUserId(): Promise<string> {
  try {
    const { stdout } = await execAsync('git config user.name');
    return stdout.trim() || process.env.USER || 'unknown_dev';
  } catch {
    return process.env.USER || 'unknown_dev';
  }
}

program.parse(process.argv);
