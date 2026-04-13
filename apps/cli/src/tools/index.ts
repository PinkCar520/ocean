import { createBashTool, createFileReadTool, createFileWriteTool, createFileEditTool, createGrepTool, createGlobTool } from './core-tools.js';
import type { ToolContext } from '../types.js';

/**
 * Get all available tools for the AI
 */
export function getTools(context: ToolContext) {
  return {
    bash: createBashTool(),
    file_read: createFileReadTool(),
    file_write: createFileWriteTool(),
    file_edit: createFileEditTool(),
    grep: createGrepTool(),
    glob: createGlobTool(),
  };
}

/**
 * Get tool descriptions for system prompt
 */
export function getToolDescriptions(context: ToolContext) {
  const tools = getTools(context);
  return Object.values(tools).map(tool => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  }));
}
