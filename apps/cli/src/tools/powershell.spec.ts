import { chmod, mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createPowerShellTool, resolvePowerShellExecutable } from './powershell.js';
import { SecurityEngine } from '../utils/security.js';

describe('CLI PowerShell tool', () => {
  let tempRoot = '';

  afterEach(async () => {
    if (tempRoot) await rm(tempRoot, { recursive: true, force: true });
  });

  it('chooses the native executable for each platform', () => {
    expect(resolvePowerShellExecutable('win32')).toBe('powershell.exe');
    expect(resolvePowerShellExecutable('darwin')).toBe('pwsh');
  });

  it('uses execFile argv, pins cwd to the workspace, and preserves command status output', async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), 'ocean-powershell-'));
    const workspace = path.join(tempRoot, 'workspace');
    await mkdir(workspace);
    const executable = path.join(tempRoot, 'fake-pwsh');
    await writeFile(executable, '#!/bin/sh\nprintf "cwd=%s\\n" "$PWD"\nprintf "<%s>\\n" "$@"\n');
    await chmod(executable, 0o700);
    const command = "Write-Output 'hello'; Write-Output 'second statement'";
    const tool = createPowerShellTool({ executable });
    const result = await tool.execute(
      { command },
      { cwd: workspace, userId: 'tester', sessionId: 's1' },
    );

    expect(tool.requiresApproval).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.data.stdout).toContain(`cwd=${await realpath(workspace)}`);
    expect(result.data.stdout).toContain('<-Command>');
    expect(result.data.stdout).toContain(`<${command}>`);
    expect(result.data.stdout).not.toContain('second statement\n');
  });

  it('blocks encoded, dynamically evaluated, credential, escalation, and root-delete commands', () => {
    const security = new SecurityEngine(process.cwd());
    for (const command of [
      'pwsh -EncodedCommand SQBFAFgA',
      'Invoke-Expression $payload',
      'Get-Content .env',
      'Start-Process powershell -Verb RunAs',
      'Remove-Item -Path C:\\ -Recurse -Force',
      'Clear-Disk -Number 0 -RemoveData',
    ]) {
      expect(security.auditPowerShellCommand(command).allowed, command).toBe(false);
    }
    expect(security.auditPowerShellCommand('Get-Content .env.example').allowed).toBe(true);
    expect(security.auditPowerShellCommand('Get-ChildItem -Recurse').riskLevel).toBe('HIGH');
  });

  it('rejects workspace escapes and checks cancellation before spawning', async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), 'ocean-powershell-'));
    const workspace = path.join(tempRoot, 'workspace');
    await mkdir(workspace);
    const executable = path.join(tempRoot, 'fake-pwsh');
    await writeFile(executable, '#!/bin/sh\necho ran\n');
    await chmod(executable, 0o700);
    const tool = createPowerShellTool({ executable });
    const escaped = await tool.execute(
      { command: 'Get-Location', cwd: '../outside' },
      { cwd: workspace, userId: 'tester', sessionId: 's1' },
    );
    expect(escaped.error).toContain('outside workspace');

    const controller = new AbortController();
    controller.abort(new Error('cancelled'));
    await expect(tool.execute(
      { command: 'Get-Location' },
      { cwd: workspace, userId: 'tester', sessionId: 's1', signal: controller.signal },
    )).rejects.toThrow('cancelled');
    expect(await readFile(executable, 'utf-8')).toContain('echo ran');
  });
});
