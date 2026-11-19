import { z } from 'zod';

const localPathSchema = z
  .string()
  .min(1)
  .max(4096)
  .refine((path) => !path.includes('\0'), 'Path must not contain a null byte');

const relativePathSchema = z
  .string()
  .max(4096)
  .refine((path) => !path.includes('\0'), 'Path must not contain a null byte')
  .refine(
    (path) =>
      !/^[\\/]/.test(path) &&
      !/^[a-z]:[\\/]/i.test(path) &&
      !path.split(/[\\/]/).includes('..'),
    'CWD must stay within its workspace root',
  );

export const workspaceRootSchema = z
  .object({
    id: z.string().uuid(),
    label: z.string().min(1).max(128),
    path: localPathSchema,
    role: z.enum(['primary', 'additional']),
    access: z.enum(['read_only', 'read_write']),
  })
  .strict();

export type WorkspaceRoot = z.infer<typeof workspaceRootSchema>;

const workspaceConfigurationBaseSchema = z
  .object({
    name: z.string().trim().min(1).max(128),
    hostId: z.string().uuid(),
    platform: z.enum(['darwin', 'win32', 'linux']),
    roots: z.array(workspaceRootSchema).min(1).max(32),
    cwd: z
      .object({
        rootId: z.string().uuid(),
        relativePath: relativePathSchema,
      })
      .strict(),
    worktree: z
      .object({
        enabled: z.boolean(),
        rootId: z.string().uuid().optional(),
      })
      .strict(),
  })
  .strict();

type WorkspaceConfigurationShape = z.infer<
  typeof workspaceConfigurationBaseSchema
>;

function validateWorkspaceConfiguration(
  configuration: WorkspaceConfigurationShape,
  context: z.RefinementCtx,
): void {
  const rootIds = new Set<string>();
  let primaryCount = 0;

  configuration.roots.forEach((root, index) => {
    if (rootIds.has(root.id)) {
      context.addIssue({
        code: 'custom',
        message: `Duplicate workspace root id: ${root.id}`,
        path: ['roots', index, 'id'],
      });
    }
    rootIds.add(root.id);
    if (root.role === 'primary') primaryCount += 1;
    const isAbsolute =
      configuration.platform === 'win32'
        ? /^[a-z]:[\\/]/i.test(root.path) ||
          /^\\\\[^\\]+\\[^\\]+/.test(root.path)
        : root.path.startsWith('/');
    if (!isAbsolute) {
      context.addIssue({
        code: 'custom',
        message: `Workspace root path must be absolute for ${configuration.platform}`,
        path: ['roots', index, 'path'],
      });
    }
  });

  if (primaryCount !== 1) {
    context.addIssue({
      code: 'custom',
      message: 'A workspace must have exactly one primary root',
      path: ['roots'],
    });
  }

  if (!rootIds.has(configuration.cwd.rootId)) {
    context.addIssue({
      code: 'custom',
      message: 'CWD must reference a workspace root',
      path: ['cwd', 'rootId'],
    });
  }

  if (configuration.worktree.enabled) {
    const primaryRoot = configuration.roots.find(
      (root) => root.role === 'primary',
    );
    if (!primaryRoot || configuration.worktree.rootId !== primaryRoot.id) {
      context.addIssue({
        code: 'custom',
        message: 'A worktree may only be enabled for the primary root',
        path: ['worktree', 'rootId'],
      });
    } else if (primaryRoot.access !== 'read_write') {
      context.addIssue({
        code: 'custom',
        message: 'A Worktree requires write access to the primary root',
        path: ['roots'],
      });
    }
  } else if (configuration.worktree.rootId !== undefined) {
    context.addIssue({
      code: 'custom',
      message: 'A disabled worktree must not specify a root',
      path: ['worktree', 'rootId'],
    });
  }
}

export const workspaceConfigurationSchema =
  workspaceConfigurationBaseSchema.superRefine(validateWorkspaceConfiguration);

export type WorkspaceConfiguration = z.infer<
  typeof workspaceConfigurationSchema
>;

export const workspaceRecordSchema = workspaceConfigurationBaseSchema
  .extend({
    id: z.string().uuid(),
    revision: z.number().int().positive(),
    status: z.enum(['active', 'archived']),
  })
  .strip()
  .superRefine(validateWorkspaceConfiguration);

export type WorkspaceRecord = z.infer<typeof workspaceRecordSchema>;

export const workspaceSnapshotSchema = workspaceConfigurationBaseSchema
  .extend({
    schemaVersion: z.literal(1),
    workspaceId: z.string().uuid(),
    workspaceRevision: z.number().int().positive(),
  })
  .strict()
  .superRefine(validateWorkspaceConfiguration);

export type WorkspaceSnapshot = z.infer<typeof workspaceSnapshotSchema>;
