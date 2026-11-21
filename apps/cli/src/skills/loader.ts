import { homedir } from 'node:os';
import * as yaml from 'js-yaml';
import { z } from 'zod';
import { resolveSkills, type SkillDescriptor } from '@ocean/core';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pluginContributions } from '../plugins/registry.js';
import type { SkillManifest, LoadedSkill } from '../types.js';

const skillSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().min(1),
  'allowed-tools': z.union([z.array(z.string()), z.string()]).optional(),
  'requires-approval': z.union([z.array(z.string()), z.string()]).optional(),
  compatibility: z.string().optional(),
  locales: z.record(z.string(), z.object({
    displayName: z.string(),
    description: z.string(),
  })).optional(),
}).passthrough();

function normalizeTools(value: string | string[] | undefined): string[] | undefined {
  if (value === undefined) return undefined;
  const list = typeof value === 'string'
    ? value.replace(/^\[|\]$/g, '').split(/[,\s]+/)
    : value;
  return [...new Set(list.map(item => item.trim()).filter(Boolean))];
}

/** Standard YAML parser with typed frontmatter validation. */
function parseFrontmatter(content: string): { manifest: SkillManifest | null; body: string } {
  content = content.replace(/\r\n/g, '\n');
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { manifest: null, body: content };
  const [, source, body] = match;
  try {
    const raw = yaml.load(source, { schema: yaml.JSON_SCHEMA });
    const parsed = skillSchema.safeParse(raw);
    if (!parsed.success) return { manifest: null, body };
    return {
      manifest: {
        name: parsed.data.name,
        description: parsed.data.description,
        'allowed-tools': normalizeTools(parsed.data['allowed-tools']),
        'requires-approval': normalizeTools(parsed.data['requires-approval']),
        compatibility: parsed.data.compatibility,
        locales: parsed.data.locales,
      },
      body: body.trim(),
    };
  } catch {
    return { manifest: null, body };
  }
}

/**
 * Load a skill from its SKILL.md file
 */
function loadSkill(skillPath: string): LoadedSkill | null {
  const skillMd = path.join(skillPath, 'SKILL.md');
  
  if (!fs.existsSync(skillMd)) {
    return null;
  }

  const fileInfo = fs.lstatSync(skillMd);
  if (!fileInfo.isFile() || fileInfo.isSymbolicLink() || fileInfo.size > 256 * 1024) {
    console.warn(`[SkillLoader] Skipping unsafe or oversized skill file: ${skillMd}`);
    return null;
  }

  const canonicalPath = fs.realpathSync(skillPath);
  const content = fs.readFileSync(skillMd, 'utf-8');
  const { manifest, body } = parseFrontmatter(content);

  if (!manifest || typeof manifest.name !== 'string' || !manifest.name.trim()
    || typeof manifest.description !== 'string' || !manifest.description.trim()) {
    console.warn(`[SkillLoader] Skill frontmatter must define name and description: ${skillMd}`);
    return null;
  }

  return {
    manifest,
    get content() {
      const info = fs.lstatSync(skillMd);
      if (!info.isFile() || info.isSymbolicLink() || info.size > 256 * 1024 || fs.realpathSync(skillPath) !== canonicalPath) throw new Error('Unsafe skill path');
      const loaded = parseFrontmatter(fs.readFileSync(skillMd, 'utf8'));
      if (loaded.manifest?.name !== manifest.name) throw new Error('Skill metadata changed; reload catalog');
      return loaded.body;
    },
    sourcePath: skillPath,
  };
}

/**
 * Discover and load all skills from a directory
 */
export function loadSkillsFromDir(skillsDir: string): LoadedSkill[] {
  const skills: LoadedSkill[] = [];

  if (!fs.existsSync(skillsDir)) {
    return skills;
  }
  const directoryInfo = fs.lstatSync(skillsDir);
  if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink()) return skills;

  const entries = fs.readdirSync(skillsDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const skillPath = path.join(skillsDir, entry.name);
      const skill = loadSkill(skillPath);
      if (skill) {
        skills.push(skill);
      }
    }
  }

  return skills;
}

/**
 * Build skill catalog XML for system prompt (AgentSkills Tier 1)
 */
export function buildCatalogXml(skills: LoadedSkill[]): string {
  if (skills.length === 0) {
    return '<available_skills />\n';
  }

  let xml = '<available_skills>\n';
  for (const skill of skills) {
    xml += `  <skill>\n`;
    xml += `    <name>${skill.manifest.name}</name>\n`;
    xml += `    <description>${skill.manifest.description}</description>\n`;
    if (skill.manifest['allowed-tools']) {
      xml += `    <allowed-tools>${skill.manifest['allowed-tools'].join(', ')}</allowed-tools>\n`;
    }
    xml += `  </skill>\n`;
  }
  xml += '</available_skills>\n';

  return xml;
}

/**
 * Get skill by name
 */
export function getSkillByName(skills: LoadedSkill[], name: string): LoadedSkill | null {
  return skills.find(s => s.manifest.name === name) || null;
}

/** User defaults, legacy project directory, then project-specific overrides. */
export function discoverSkills(workspace: string, home = homedir()): LoadedSkill[] {
  const entries: Array<{ descriptor: SkillDescriptor; skill: LoadedSkill }> = [];
  const add = (skill: LoadedSkill, source: SkillDescriptor['source']) => {
    entries.push({ descriptor: { id: skill.sourcePath, name: skill.manifest.name, source }, skill });
  };
  for (const directory of pluginContributions('skills', home)) {
    for (const skill of loadSkillsFromDir(directory)) add(skill, 'plugin');
  }
  for (const [base, source] of [[home, 'user'], [workspace, 'project']] as const) {
    for (const directory of ['agents/skills', '.claude/skills', '.ocean/skills']) {
      for (const skill of loadSkillsFromDir(path.join(fs.realpathSync(base), directory))) add(skill, source);
    }
  }
  const resolved = resolveSkills(entries.map(entry => entry.descriptor));
  return resolved.map(descriptor => entries.find(entry => entry.descriptor.id === descriptor.id)!.skill);
}
