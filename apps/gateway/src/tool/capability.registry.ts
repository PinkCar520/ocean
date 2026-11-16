import { capabilitySchema, type CapabilityContract } from '@ocean/contracts';

/**
 * CapabilityRegistry —— Ocean 工具能力注册表。
 *
 * 每个工具的「能力属性」直接采用共享契约 `Capability` (packages/contracts/
 * schemas/domain.schema.json) 的字段，再附加一个本地的默认权限决策。
 * 与 Claude Code 的 fail-closed Tool 契约同理：能力属性集中声明，
 * 策略评估只查表、不再硬编码工具名。
 */

export type CapabilityDecision = 'allow' | 'confirmed' | 'authenticated' | 'deny';

export interface RegisteredCapability extends CapabilityContract {
  /** 无匹配策略时的默认决策。allow = 不拦截；其余 = 走人工审批/认证。 */
  defaultDecision: CapabilityDecision;
}

export const OCEAN_CAPABILITIES: Record<string, RegisteredCapability> = {
  // zentao tools
  getBugInfo: {
    capability: 'zentao.bug.read',
    execution: 'server',
    sideEffect: 'read',
    supportsIdempotency: true,
    supportsQuery: true,
    supportsCancel: false,
    defaultDecision: 'allow',
  },
  searchBugs: {
    capability: 'zentao.bug.search',
    execution: 'server',
    sideEffect: 'read',
    supportsIdempotency: true,
    supportsQuery: true,
    supportsCancel: false,
    defaultDecision: 'allow',
  },
  resolveBug: {
    capability: 'zentao.bug.resolve',
    execution: 'server',
    sideEffect: 'reversible_write',
    supportsIdempotency: false,
    supportsQuery: true,
    supportsCancel: false,
    defaultDecision: 'confirmed',
  },

  // local workstation tools (executed through the CLI RPC bridge)
  local_file_read: {
    capability: 'local.file.read',
    execution: 'device',
    sideEffect: 'read',
    supportsIdempotency: true,
    supportsQuery: true,
    supportsCancel: false,
    defaultDecision: 'allow',
  },
  local_file_edit: {
    capability: 'local.file.edit',
    execution: 'device',
    sideEffect: 'reversible_write',
    supportsIdempotency: false,
    supportsQuery: true,
    supportsCancel: false,
    defaultDecision: 'confirmed',
  },
  local_file_write: {
    capability: 'local.file.write', execution: 'device', sideEffect: 'reversible_write',
    supportsIdempotency: false, supportsQuery: true, supportsCancel: false, defaultDecision: 'confirmed',
  },
  local_file_patch: {
    capability: 'local.file.patch', execution: 'device', sideEffect: 'reversible_write',
    supportsIdempotency: false, supportsQuery: true, supportsCancel: false, defaultDecision: 'confirmed',
  },
  local_notebook_read: {
    capability: 'local.notebook.read', execution: 'device', sideEffect: 'read',
    supportsIdempotency: true, supportsQuery: true, supportsCancel: false, defaultDecision: 'allow',
  },
  local_notebook_edit: {
    capability: 'local.notebook.edit', execution: 'device', sideEffect: 'reversible_write',
    supportsIdempotency: false, supportsQuery: true, supportsCancel: false, defaultDecision: 'confirmed',
  },
  local_git: {
    capability: 'local.git',
    execution: 'device',
    sideEffect: 'reversible_write',
    supportsIdempotency: false,
    supportsQuery: true,
    supportsCancel: false,
    defaultDecision: 'confirmed',
  },
  local_bash: {
    capability: 'local.shell.exec',
    execution: 'device',
    sideEffect: 'irreversible_write',
    supportsIdempotency: false,
    supportsQuery: false,
    supportsCancel: false,
    defaultDecision: 'confirmed',
  },
  local_powershell: {
    capability: 'local.shell.powershell',
    execution: 'device',
    sideEffect: 'irreversible_write',
    supportsIdempotency: false,
    supportsQuery: false,
    supportsCancel: false,
    defaultDecision: 'confirmed',
  },
  local_plan: {
    capability: 'local.plan',
    execution: 'device',
    sideEffect: 'reversible_write',
    supportsIdempotency: false,
    supportsQuery: true,
    supportsCancel: false,
    defaultDecision: 'allow',
  },

  // ocean services
  rag_search: {
    capability: 'ocean.rag.search',
    execution: 'server',
    sideEffect: 'read',
    supportsIdempotency: true,
    supportsQuery: true,
    supportsCancel: false,
    defaultDecision: 'allow',
  },
  activate_skill: {
    capability: 'ocean.skill.activate',
    execution: 'server',
    sideEffect: 'read',
    supportsIdempotency: true,
    supportsQuery: true,
    supportsCancel: false,
    defaultDecision: 'allow',
  },

  // builtin run-engine tools
  echo: {
    capability: 'ocean.echo',
    execution: 'server',
    sideEffect: 'read',
    supportsIdempotency: true,
    supportsQuery: false,
    supportsCancel: false,
    defaultDecision: 'allow',
  },
  'counter.increment': {
    capability: 'ocean.counter.increment',
    execution: 'server',
    sideEffect: 'reversible_write',
    supportsIdempotency: true,
    supportsQuery: true,
    supportsCancel: false,
    defaultDecision: 'allow',
  },
  'notify.send': {
    capability: 'ocean.notify.send',
    execution: 'server',
    sideEffect: 'irreversible_write',
    supportsIdempotency: false,
    supportsQuery: false,
    supportsCancel: false,
    defaultDecision: 'confirmed',
  },
  'web.get': {
    capability: 'ocean.web.get',
    execution: 'server',
    sideEffect: 'read',
    supportsIdempotency: false,
    supportsQuery: false,
    supportsCancel: false,
    defaultDecision: 'allow',
  },
  'artifact.save': {
    capability: 'ocean.artifact.save',
    execution: 'server',
    sideEffect: 'reversible_write',
    supportsIdempotency: true,
    supportsQuery: true,
    supportsCancel: false,
    defaultDecision: 'allow',
  },
  'artifact.load': {
    capability: 'ocean.artifact.read',
    execution: 'server',
    sideEffect: 'read',
    supportsIdempotency: true,
    supportsQuery: true,
    supportsCancel: false,
    defaultDecision: 'allow',
  },
};

// Fail fast at startup: every registration must satisfy the shared contract.
for (const [toolName, registration] of Object.entries(OCEAN_CAPABILITIES)) {
  const { defaultDecision: _defaultDecision, ...descriptor } = registration;
  try {
    capabilitySchema.parse(descriptor);
  } catch (error) {
    throw new Error(
      `invalid capability registration for tool "${toolName}": ${(error as Error).message}`,
    );
  }
}

/**
 * Resolve the default permission decision for a tool.
 * - MCP tools are conservative by default (confirmed).
 * - Registered tools use their declared default.
 * - Unregistered non-MCP tools preserve the existing allow behavior.
 */
export function defaultDecisionFor(
  toolName: string,
  isMcp: boolean,
): CapabilityDecision {
  if (isMcp) return 'confirmed';
  return OCEAN_CAPABILITIES[toolName]?.defaultDecision ?? 'allow';
}
