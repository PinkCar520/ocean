import * as fs from 'node:fs';
import * as path from 'node:path';
import type { SkillManifest, LoadedSkill } from '../types.js';

/**
 * Parse YAML frontmatter from SKILL.md
 */
function parseFrontmatter(content: string): { manifest: SkillManifest | null; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) {
    return { manifest: null, body: content };
  }

  const [, yamlStr, body] = match;
  
  // Simple YAML parser (for production, use a proper YAML library)
  const manifest = parseSimpleYaml(yamlStr) as SkillManifest;
  
  return { manifest, body: body.trim() };
}

/**
 * Simple YAML parser for flat/nested structures
 */
function parseSimpleYaml(yaml: string): Record<string, any> {
  const result: Record<string, any> = {};
  const lines = yaml.split('\n');
  let currentKey: string | null = null;
  let currentArray: string[] | null = null;
  let currentObj: Record<string, any> | null = null;
  let currentObjKey: string | null = null;

  for (const line of lines) {
    // Skip empty lines and comments
    if (!line.trim() || line.trim().startsWith('#')) continue;

    // Check for array item
    if (line.trim().startsWith('- ')) {
      if (currentKey && currentArray) {
        currentArray.push(line.trim().slice(2).replace(/^["']|["']$/g, ''));
      }
      continue;
    }

    // Check for key: value
    const kvMatch = line.match(/^(\s*)([\w-]+):\s*(.*)$/);
    if (kvMatch) {
      const [, indent, key, value] = kvMatch;
      
      if (!indent) {
        // Top-level key
        currentKey = key;
        currentArray = null;
        currentObj = null;
        currentObjKey = null;

        if (value) {
          // Inline value
          result[key] = value.replace(/^["']|["']$/g, '').replace(/\s*#.*$/, '');
        } else {
          // Will be array or object
          currentArray = [];
          result[key] = currentArray;
        }
      } else if (currentKey) {
        // Nested key
        if (!currentObj) {
          currentObj = {};
          currentObjKey = key;
          result[currentKey] = currentObj;
        }
        if (currentObj) {
          currentObj[key] = value.replace(/^["']|["']$/g, '').replace(/\s*#.*$/, '');
        }
      }
    }
  }

  return result;
}

/**
 * Load a skill from its SKILL.md file
 */
function loadSkill(skillPath: string): LoadedSkill | null {
  const skillMd = path.join(skillPath, 'SKILL.md');
  
  if (!fs.existsSync(skillMd)) {
    return null;
  }

  const content = fs.readFileSync(skillMd, 'utf-8');
  const { manifest, body } = parseFrontmatter(content);

  if (!manifest) {
    console.warn(`[SkillLoader] No frontmatter found in ${skillMd}`);
    return null;
  }

  return {
    manifest,
    content: body,
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
