import { Injectable } from '@nestjs/common';

import { ArtifactStore } from '../artifact/artifact.store';
import { EgressPolicy } from '../sandbox/egress-policy';
import { createBuiltinTools } from './builtin.tools';
import { TOOL_REGISTRY, Tool } from './tool.types';

@Injectable()
export class ToolRegistry {
  private readonly tools = new Map<string, Tool>();

  constructor(
    egress: EgressPolicy = EgressPolicy.fromEnv(),
    artifactStore?: ArtifactStore,
  ) {
    for (const tool of createBuiltinTools(egress, artifactStore)) {
      this.register(tool);
    }
  }

  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  list(): Tool[] {
    return [...this.tools.values()];
  }
}

export { TOOL_REGISTRY };
