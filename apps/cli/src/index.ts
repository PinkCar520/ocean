#!/usr/bin/env node

/**
 * Ocean CLI - Entry Point
 * 
 * Dual mode:
 * - `ocean -p <query>` - Non-interactive execution
 * - `ocean` (no args) - Interactive REPL mode
 */

import { Command, Option } from 'commander';
import { parsePermissionSettings } from '@ocean/core/permission-policy';
import type { ToolContext } from './types.js';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import * as dotenv from 'dotenv';
import chalk from 'chalk';
import ora, { type Ora } from 'ora';
import * as os from 'node:os';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

// ESM __dirname replacement
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env
// dist/index.js is at apps/cli/dist, .env is at project root
// Need to go up 3 levels: dist -> cli -> apps -> project-root
const envRoot = path.resolve(__dirname, '../../..');
// Explicit process environment wins over project .env, which wins over root .env.
const explicitEnv = { ...process.env };
// Only the launcher may select the managed settings file.
const managedSettingsPath = process.env.OCEAN_MANAGED_SETTINGS_PATH;
const envResult1 = dotenv.config({ path: path.join(envRoot, '.env'), override: true, quiet: true });
const envResult2 = dotenv.config({ path: path.resolve(process.cwd(), '.env'), override: true, quiet: true });
Object.assign(process.env, explicitEnv);

// Debug logging (only when DEBUG env is set)
if (managedSettingsPath === undefined) delete process.env.OCEAN_MANAGED_SETTINGS_PATH;
else process.env.OCEAN_MANAGED_SETTINGS_PATH = managedSettingsPath;

if (process.env.DEBUG) {
  console.error(`[dotenv debug] __dirname=${__dirname}`);
  console.error(`[dotenv debug] envRoot=${envRoot}`);
  console.error(`[dotenv debug] envResult1 parsed keys=${Object.keys(envResult1.parsed || {}).length}`);
  console.error(`[dotenv debug] DEFAULT_AI_PROVIDER=${process.env.DEFAULT_AI_PROVIDER || '(undefined)'}`);
  console.error(`[dotenv debug] DEEPSEEK_BASE_URL=${process.env.DEEPSEEK_BASE_URL || '(undefined)'}`);
}

const execAsync = promisify(exec);

// Import submodules (will be created)
import { runPrintStream, runRepl } from './repl.js';
import { runDaemon } from './daemon.js';
import { registerTaskCommands } from './commands/tasks.js';
import { registerPluginCommands } from './commands/plugins.js';
import { registerVoiceCommands } from './commands/voice.js';
import { registerRemoteCommands } from './commands/remote.js';
import { registerSessionCommands } from './commands/sessions.js';
import { resolveApiKey, saveCredentials, removeCredentials, getAutoUserId } from './utils/auth.js';

const program = new Command();

program
  .name('ocean')
  .description('Ocean AI Workstream Terminal Node')
  .version('1.0.0');

/**
 * Ensure user is authenticated before entering CLI session.
 * Returns true if already authenticated or login succeeds.
 */
async function ensureAuth(gatewayUrl: string): Promise<boolean> {
  const existing = await resolveApiKey();
  if (existing) return true;

  // Not authenticated, prompt user to login (Codex-style UI)
  console.log(chalk.bold('\nWelcome to Ocean Code') + chalk.gray(", Ocean Code's command-line AI assistant"));
  console.log(chalk.gray('Sign in via browser or provide an API key to get started\n'));

  const { action } = await renderAuthMenu();

  if (action === 'browser') await browserOAuthFlow(gatewayUrl);
  if (action === 'headless') await headlessOAuthFlow(gatewayUrl);
  if (action === 'apiKey') {
    console.log('');
    const { key } = await promptInput('Enter API Key:', '*');
    await saveCredentials({ apiKey: key });
    console.log(chalk.green('✓ API Key saved.'));
  }

  return true;
}

import { runAuthMenu } from './ui/auth.js';

/**
 * Render an interactive menu using the new Ink-based component.
 */
async function renderAuthMenu(): Promise<{ action: string }> {
  return await runAuthMenu();
}

/**
 * Simple prompt input
 */
async function promptInput(message: string, mask?: string): Promise<{ key: string }> {
  const readline = await import('readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  return new Promise((resolve) => {
    const prompt = (prefix = '') => {
      rl.question(chalk.gray(`  ${message} `), (answer) => {
        rl.close();
        resolve({ key: answer });
      });
    };
    prompt();
  });
}

// ─── Default: REPL Mode ──────────────────────────────────────
program
  .argument('[query]', 'Direct query (exits after answering)')
  .option('-p, --print', 'Run a prompt and print the response without interactive login')
  .addOption(new Option('--input-format <format>', 'Print input format').choices(['text', 'stream-json']))
  .option('--replay-user-messages', 'Acknowledge each structured user message')
  .addOption(new Option('--output-format <format>', 'Print output format').choices(['text', 'json', 'stream-json']))
  .addOption(new Option('-c, --continue', 'Continue the latest session').conflicts('resume'))
  .option('-r, --resume <session-id>', 'Resume a session by ID')
  .option('--fork-session', 'Continue a conversation in a new session')
  .addOption(new Option('--system-prompt <text>', 'Replace the Agent system prompt').conflicts('systemPromptFile'))
  .option('--system-prompt-file <path>', 'Read the replacement system prompt from a file')
  .addOption(new Option('--append-system-prompt <text>', 'Append instructions to the Agent prompt').conflicts('appendSystemPromptFile'))
  .option('--append-system-prompt-file <path>', 'Read additional system instructions from a file')
  .option('--max-turns <count>', 'Maximum model calls for one print turn')
  .option('--fork-at <message-id>', 'Fork a Gateway session at a specific message')
  .addOption(new Option('--permission-prompt-tool <tool>', 'Ask the SDK host to approve tools').choices(['stdio']))
  .option('--settings <file-or-json>', 'Read additional permission settings for this execution')
  .option('--setting-sources <sources>', 'Comma-separated permission settings sources: user,project,local')
  .option('--allow-tool <rule>', 'Add a permission allow rule for this execution', (rule, rules: string[]) => [...rules, rule], [])
  .option('--deny-tool <rule>', 'Add a permission deny rule for this execution', (rule, rules: string[]) => [...rules, rule], [])
  .option('--tools <names>', 'Tools exposed to the model (comma or space separated, default, or empty)')
  .addOption(new Option('--permission-mode <mode>', 'Set the local print session permission mode').choices(['default', 'acceptEdits', 'plan', 'dontAsk', 'bypassPermissions']))
  .addOption(new Option('--no-session-persistence', 'Run without saving a print session').conflicts(['continue', 'resume']))
  .option('-m, --model <model>', 'Model to use')
  .option('-w, --workspace <path>', 'Workspace directory', process.cwd())
  .option('-u, --user <userId>', 'User ID')
  .option('--gateway', '通过 Gateway Run API 执行（统一工具/审批/审计）')
  .option('--remote-workspace <id>', 'Attach an enrolled workspace to the Gateway session')
  .action(async (query, options) => {
    const gatewayUrl = process.env.OCEAN_GATEWAY_URL || 'http://localhost:3000';
    const workspace = path.resolve(options.workspace);

    const customPrompt = [options.systemPrompt, options.systemPromptFile, options.appendSystemPrompt, options.appendSystemPromptFile]
      .some(value => value !== undefined);
    const localToolOptions = options.permissionMode || options.settings || options.settingSources !== undefined
      || options.allowTool.length || options.denyTool.length;
    // -c/--continue and -r/--resume also work in interactive mode, so they are not print-only.
    const printOptions = customPrompt || options.maxTurns !== undefined || options.forkSession || options.sessionPersistence === false || options.tools !== undefined || localToolOptions;
    if (!options.print && (options.outputFormat || options.inputFormat || options.replayUserMessages || printOptions)) {
      program.error('error: print options require --print');
    }
    if (options.forkAt !== undefined && (!options.gateway || !options.forkSession || !options.print)) {
      program.error('error: --fork-at requires --gateway --fork-session --print');
    }
    if (options.forkSession && !options.continue && !options.resume) {
      program.error('error: --fork-session requires --continue or --resume');
    }
    if (options.permissionPromptTool && (!options.print || options.inputFormat !== 'stream-json')) {
      program.error('error: --permission-prompt-tool stdio requires --print with stream-json input and output');
    }
    if (options.gateway && localToolOptions) {
      program.error('error: custom permission and tool options are currently available for local execution');
    }
    if (options.remoteWorkspace && (!options.gateway || !options.print || options.resume || options.sessionPersistence === false)) {
      program.error('error: --remote-workspace requires a persistent Gateway print session; an existing session already has a workspace binding');
    }
    if (options.inputFormat === 'stream-json' && options.outputFormat !== 'stream-json') {
      program.error('error: stream-json input requires stream-json output');
    }
    if (options.replayUserMessages && options.inputFormat !== 'stream-json') {
      program.error('error: --replay-user-messages requires --input-format stream-json');
    }
    if (options.print) {
      const streamInput = options.inputFormat === 'stream-json';
      if (!streamInput && query === undefined && !process.stdin.isTTY) {
        process.stdin.setEncoding('utf8');
        query = '';
        for await (const chunk of process.stdin) query += chunk;
      }
      if (!streamInput && !query?.trim()) {
        program.error('error: provide a prompt as an argument or on stdin with --print');
      }
      if (!(await resolveApiKey())) {
        program.error('error: --print requires authentication. Run ocean login first.');
      }

      let commandPermissionSettings: ToolContext['commandPermissionSettings'];
      if (options.settings || options.allowTool.length || options.denyTool.length) {
        let root = workspace;
        let raw: unknown = {};
        if (options.settings) {
          const source = options.settings.trim();
          if (source.startsWith('{')) raw = JSON.parse(source);
          else {
            const file = path.resolve(source);
            root = path.dirname(file);
            const info = await fs.stat(file);
            if (!info.isFile() || info.size > 256 * 1024) throw new Error('Invalid or oversized settings file.');
            raw = JSON.parse(await fs.readFile(file, 'utf8'));
          }
        }
        const value = parsePermissionSettings(raw);
        if (!value) throw new Error('Invalid permission settings.');
        const combined = parsePermissionSettings({
          ...value,
          allow: [...(value.allow ?? []), ...options.allowTool],
          deny: [...(value.deny ?? []), ...options.denyTool],
        });
        if (!combined) throw new Error('Invalid command-line permission rule.');
        commandPermissionSettings = { value: combined, root };
      }
      const permissionSources = options.settingSources === undefined
        ? undefined
        : new Set<'user' | 'project' | 'local'>(
          (options.settingSources as string).split(',').map((source) => source.trim()).filter(Boolean).map((source) => {
            if (source !== 'user' && source !== 'project' && source !== 'local') throw new Error(`Unknown permission settings source: ${source}`);
            return source;
          }),
        );
      const toolNames = options.tools === undefined || options.tools.trim().toLowerCase() === 'default'
        ? undefined
        : new Set<string>((options.tools as string).split(/[\s,]+/).filter(Boolean));

      const maxTurns = options.maxTurns === undefined ? undefined : Number(options.maxTurns);
      if (maxTurns !== undefined && (!/^\d+$/.test(options.maxTurns) || !Number.isSafeInteger(maxTurns) || maxTurns < 1)) {
        program.error('error: --max-turns requires a positive integer');
      }
      const readPromptFile = async (file?: string) => {
        if (file === undefined) return undefined;
        const handle = await fs.open(file, 'r');
        try {
          const info = await handle.stat();
          if (!info.isFile() || info.size > 256 * 1024) throw new Error('Invalid or oversized system prompt file.');
          const buffer = Buffer.alloc(info.size + 1);
          const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
          if (bytesRead !== info.size) throw new Error('System prompt file changed while reading.');
          return buffer.subarray(0, bytesRead).toString('utf8');
        } finally {
          await handle.close();
        }
      };
      const systemPrompt = options.systemPrompt ?? await readPromptFile(options.systemPromptFile);
      const appendSystemPrompt = options.appendSystemPrompt ?? await readPromptFile(options.appendSystemPromptFile);
      const execution: Parameters<typeof runRepl>[0] = {
        userId: options.user || await getAutoUserId(),
        workspace,
        singleQuery: query,
        gateway: options.gateway,
        remoteWorkspaceId: options.remoteWorkspace,
        print: options.outputFormat ?? 'text',
        continueSession: options.continue,
        resume: options.resume,
        forkSession: options.forkSession,
        forkAt: options.forkAt,
        persistSession: options.sessionPersistence,
        permissionMode: options.permissionMode,
        stdioPermission: options.permissionPromptTool === 'stdio',
        commandPermissionSettings,
        permissionSources,
        toolNames,
        modelId: options.model,
        maxTurns,
        systemPrompt,
        appendSystemPrompt,
      };
      if (streamInput) await runPrintStream(execution, options.replayUserMessages);
      else await runRepl(execution);
      return;
    }

    // Ensure authenticated
    const ok = await ensureAuth(gatewayUrl);
    if (!ok) process.exit(0);

    const userId = options.user || await getAutoUserId();

    if (query) {
      // Single query mode - non-interactive
      console.log(chalk.cyan(`[Ocean] Query: ${query}`));
      console.log(chalk.cyan(`[Ocean] User: ${userId}`));
      console.log(chalk.cyan(`[Ocean] Workspace: ${workspace}\n`));
      await runRepl({
        userId,
        workspace,
        singleQuery: query,
        gateway: options.gateway,
      });
    } else {
      // Interactive REPL: the Ink status bar renders the header, so only print it
      // for the readline fallback used when stdin is not a TTY.
      if (!process.stdin.isTTY) {
        console.log(chalk.bold('\nOcean Code'));
        console.log(chalk.gray(`User: ${userId} | Workspace: ${workspace}`));
        console.log(chalk.gray('Type your question or use /help for commands\n'));
      }
      await runRepl({
        userId,
        workspace,
        continueSession: options.continue,
        resume: options.resume,
      });
    }
  });

// ─── Daemon Mode ─────────────────────────────────────────────
program
  .command('daemon')
  .description('Start persistent Ocean node daemon to await commands from Gateway')
  .option('-u, --user <userId>', 'User ID for identity binding (default: auto-detected)')
  .action(async (options) => {
    const userId = options.user || await getAutoUserId();
    await runDaemon({ userId });
  });

// ─── Login Command ──────────────────────────────────────────────────
program
  .command('login')
  .description('Authenticate with Gateway')
  .option('--api-key <key>', 'Directly set API Key')
  .action(async (options) => {
    const gatewayUrl = process.env.OCEAN_GATEWAY_URL || 'http://localhost:3000';

    if (options.apiKey) {
      await saveCredentials({ apiKey: options.apiKey });
      console.log(chalk.green('✓ API Key saved.'));
      await enterCliSession();
      return;
    }

    // Reuse ensureAuth for interactive login
    const ok = await ensureAuth(gatewayUrl);
    if (ok) await enterCliSession();
    else process.exit(1);
  });

// ─── Logout Command ──────────────────────────────────────────────────
program
  .command('logout')
  .description('Remove local credentials and logout')
  .action(async () => {
    const success = await removeCredentials();
    if (success) {
      console.log(chalk.green('✓ Successfully logged out. Local credentials removed.'));
    } else {
      console.log(chalk.yellow('! No local credentials found. You are already logged out.'));
    }
    process.exit(0);
  });

// ─── Whoami Command ──────────────────────────────────────────────────
program
  .command('whoami')
  .description('Display current login status and identity')
  .action(async () => {
    const key = await resolveApiKey();
    if (!key) {
      console.log(chalk.yellow('Not logged in. Use `ocean login` to authenticate.'));
    } else {
      const userId = await getAutoUserId();
      console.log(chalk.bold('Status: ') + chalk.green('Logged In'));
      console.log(chalk.bold('Identity: ') + chalk.cyan(userId));
    }
    process.exit(0);
  });

// ─── OAuth Flow Helpers ─────────────────────────────────────────────

/**
 * Enter CLI session after successful authentication
 */
async function enterCliSession() {
  const userId = process.env.OCEAN_WORK_ID || process.env.OCEAN_USER_ID || (await getAutoUserId());
  if (!process.stdin.isTTY) {
    console.log(chalk.bold('\nOcean Code'));
    console.log(chalk.gray(`User: ${userId} | Workspace: ${process.cwd()}\n`));
  }
  await runRepl({ userId, workspace: process.cwd() });
}

/**
 * Browser OAuth flow - opens browser automatically
 */
async function browserOAuthFlow(gatewayUrl: string) {
  const spinner = ora('Starting browser login...').start();
  
  const { createServer } = await import('node:http');
  const { randomBytes } = await import('node:crypto');

  try {
    spinner.text = 'Finding an available port...';
    const port = await findPort();
    const state = randomBytes(16).toString('hex');
    const callbackPath = '/callback';
    const redirectUri = `http://127.0.0.1:${port}${callbackPath}`;
    spinner.info(`Callback server will run on port ${port}`).start();

    const authUrl = `${gatewayUrl}/api/auth/oauth/authorize?response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&port=${port}`;

    spinner.text = 'Opening browser for authorization...';
    const open = await import('open');
    await open.default(authUrl);
    
    spinner.text = 'Waiting for authorization in browser...';
    await waitForOAuthCode({ port, callbackPath, gatewayUrl, spinner });

  } catch (err: any) {
    spinner.fail(`Browser login failed: ${err.message}`);
    process.exit(1);
  }
}

/**
 * Headless OAuth flow - prints URL for manual browser visit
 */
async function headlessOAuthFlow(gatewayUrl: string) {
  const spinner = ora('Starting headless login...').start();

  const { createServer } = await import('node:http');
  const { randomBytes } = await import('node:crypto');

  try {
    spinner.text = 'Finding an available port...';
    const port = await findPort();
    const state = randomBytes(16).toString('hex');
    const callbackPath = '/callback';
    const redirectUri = `http://127.0.0.1:${port}${callbackPath}`;
    spinner.info(`Callback server will run on port ${port}`).start();

    const authUrl = `${gatewayUrl}/api/auth/oauth/authorize?response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&port=${port}`;

    spinner.warn('Could not open browser automatically.');
    console.log(chalk.yellow(`\nPlease visit this URL to authorize:\n  ${chalk.cyan(authUrl)}\n`));
    
    spinner.text = 'Waiting for authorization...';
    await waitForOAuthCode({ port, callbackPath, gatewayUrl, spinner });

  } catch (err: any) {
    spinner.fail(`Headless login failed: ${err.message}`);
    process.exit(1);
  }
}

const findPort = async (): Promise<number> => {
  const { createServer } = await import('node:http');
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as any).port;
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
};


/**
 * Wait for OAuth authorization code from local callback server
 */
async function waitForOAuthCode({
  port,
  callbackPath,
  gatewayUrl,
  spinner,
}: {
  port: number;
  callbackPath: string;
  gatewayUrl: string;
  spinner: Ora;
}) {
  const { createServer } = await import('node:http');

  const codePromise = new Promise<string>((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url!, `http://127.0.0.1:${port}`);

      if (url.pathname === callbackPath) {
        const code = url.searchParams.get('code');
        if (code) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`
            <!DOCTYPE html>
            <html><head><title>Ocean Auth Complete</title>
            <style>
              body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;background:#f6f3f2;margin:0}
              .card{background:#fff;padding:40px;border-radius:16px;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,0.08)}
              h1{color:#1c1b1b;font-size:20px;margin:0 0 8px}
              p{color:#716b67;font-size:14px;margin:0}
            </style>
            </head><body><div class="card"><h1>✓ Authorization Successful</h1>
            <p>You can close this window and return to the terminal.</p></div></body></html>
          `);
          resolve(code);
        } else {
          res.writeHead(400);
          res.end('Missing code parameter');
          reject(new Error('Authorization failed: missing code'));
        }
        setTimeout(() => server.close(), 500);
      } else {
        res.writeHead(404).end();
      }
    });

    server.listen(port, '127.0.0.1');
    server.on('error', reject);
    setTimeout(() => {
      server.close();
      reject(new Error('Login timed out after 5 minutes.'));
    }, 5 * 60 * 1000);
  });

  const code = await codePromise;
  spinner.text = 'Authorization code received. Exchanging for API Key...';

  const res = await fetch(`${gatewayUrl}/api/auth/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, name: `CLI Login @ ${os.hostname()}` }),
  });
  const data = await res.json();

  if (!res.ok || !data.key) {
    throw new Error(`Failed to obtain API Key: ${data.message || 'Unknown error'}`);
  }

  await saveCredentials({ apiKey: data.key, userId: data.workId });
  spinner.succeed(`Authentication successful. Logged in as ${data.workId}.`);
}

// ─── Legacy: Start Command ───────────────────────────────────
program
  .command('start')
  .description('Start Ocean interaction pointing to a task/bug')
  .argument('[task_id]', 'ID of the ZenTao or GitLab task')
  .action(async (taskId) => {
    const userId = await getAutoUserId();
    const workspace = process.cwd();

    if (taskId) {
      console.log(chalk.cyan(`[Ocean] Fetching ZenTao context for: ${taskId}...`));
      console.log(chalk.cyan(`[Ocean] User: ${userId}\n`));
      await runRepl({
        userId,
        workspace,
        singleQuery: `帮我查看禅道缺陷 ${taskId} 的详情并分析如何修复`
      });
    } else {
      console.log(chalk.cyan('[Ocean] Initializing general analysis...\n'));
      await runRepl({ userId, workspace });
    }
  });

registerTaskCommands(program);
registerPluginCommands(program);
registerVoiceCommands(program);
registerRemoteCommands(program);
registerSessionCommands(program);

await program.parseAsync(process.argv).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
