import type { Command } from 'commander';
import { listPlugins, readPluginSource, updatePluginRegistry } from '../plugins/registry.js';

export function registerPluginCommands(program: Command): void {
  const plugins = program.command('plugins').description('Manage locally installed Ocean plugins');

  plugins.command('list').action(() => {
    process.stdout.write(`${JSON.stringify(listPlugins(), null, 2)}\n`);
  });

  plugins.command('install').argument('<directory>').action(async (directory: string) => {
    const source = readPluginSource(directory);
    await updatePluginRegistry((entries) => {
      if (entries.some((entry) => entry.id === source.id)) throw new Error(`Plugin ${source.id} is already installed.`);
      entries.push({ ...source, enabled: true });
    });
    process.stdout.write(`${source.id}@${source.version}\n`);
  });

  plugins.command('update').argument('<id>').option('--source <directory>').action(async (id: string, options: { source?: string }) => {
    await updatePluginRegistry((entries) => {
      const current = entries.find((entry) => entry.id === id);
      if (!current) throw new Error(`Unknown plugin: ${id}`);
      const updated = readPluginSource(options.source ?? current.source);
      if (updated.id !== id) throw new Error('Updated source has a different plugin ID.');
      Object.assign(current, updated);
    });
  });

  for (const action of ['enable', 'disable', 'uninstall'] as const) {
    plugins.command(action).argument('<id>').action(async (id: string) => {
      await updatePluginRegistry((entries) => {
        const index = entries.findIndex((entry) => entry.id === id);
        if (index < 0) throw new Error(`Unknown plugin: ${id}`);
        if (action === 'uninstall') entries.splice(index, 1);
        else entries[index].enabled = action === 'enable';
      });
    });
  }
}
