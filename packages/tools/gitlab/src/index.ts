import axios, { AxiosInstance } from 'axios';

export interface GitLabConfig {
  baseUrl: string;
  token: string;
  isMock?: boolean;
}

export interface GitLabProject {
  id: number;
  name: string;
  pathWithNamespace: string;
  description?: string;
  webUrl: string;
  defaultBranch: string;
}

export interface GitLabMR {
  id: number;
  iid: number;
  projectId: number;
  title: string;
  description?: string;
  sourceBranch: string;
  targetBranch: string;
  state: 'opened' | 'merged' | 'closed';
  author: string;
  assignee?: string;
  createdAt: string;
  updatedAt: string;
  webUrl: string;
}

export interface GitLabChange {
  oldPath: string;
  newPath: string;
  aMode: string;
  bMode: string;
  diff: string;
  newFile: boolean;
  renamedFile: boolean;
  deletedFile: boolean;
}

export class GitLabTool {
  private client: AxiosInstance;
  private token: string;

  constructor(config: GitLabConfig) {
    this.token = config.token;
    this.client = axios.create({
      baseURL: config.baseUrl.replace(/\/+$/, ''),
      headers: {
        'PRIVATE-TOKEN': config.token,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });
  }

  /**
   * 列出所有项目
   */
  async listProjects(search?: string): Promise<GitLabProject[]> {
    console.log(`[@uclaw/tools-gitlab] Listing projects${search ? ` (search: ${search})` : ''}`);

    try {
      const response = await this.client.get('/api/v4/projects', {
        params: search ? { search } : {},
      });

      return response.data.map((project: any) => ({
        id: project.id,
        name: project.name,
        pathWithNamespace: project.path_with_namespace,
        description: project.description || undefined,
        webUrl: project.web_url,
        defaultBranch: project.default_branch || 'main',
      }));
    } catch (err: any) {
      console.error(`[@uclaw/tools-gitlab] List Projects Error:`, err.message);
      if (err.response) {
        console.error(`[@uclaw/tools-gitlab] Status:`, err.response.status, JSON.stringify(err.response.data));
      }
      return [];
    }
  }

  /**
   * 列出合并请求
   */
  async listMRs(projectId: number, state?: string): Promise<GitLabMR[]> {
    console.log(`[@uclaw/tools-gitlab] Listing MRs for project ${projectId}${state ? ` (state: ${state})` : ''}`);

    try {
      const response = await this.client.get(`/api/v4/projects/${projectId}/merge_requests`, {
        params: state ? { state } : {},
      });

      return response.data.map((mr: any) => ({
        id: mr.id,
        iid: mr.iid,
        projectId: mr.project_id,
        title: mr.title,
        description: mr.description || undefined,
        sourceBranch: mr.source_branch,
        targetBranch: mr.target_branch,
        state: mr.state,
        author: mr.author?.name || 'Unknown',
        assignee: mr.assignee?.name,
        createdAt: mr.created_at,
        updatedAt: mr.updated_at,
        webUrl: mr.web_url,
      }));
    } catch (err: any) {
      console.error(`[@uclaw/tools-gitlab] List MRs Error:`, err.message);
      if (err.response) {
        console.error(`[@uclaw/tools-gitlab] Status:`, err.response.status, JSON.stringify(err.response.data));
      }
      return [];
    }
  }

  /**
   * 创建合并请求
   */
  async createMR(
    projectId: number,
    data: {
      title: string;
      sourceBranch: string;
      targetBranch: string;
      description?: string;
    },
  ): Promise<GitLabMR> {
    console.log(`[@uclaw/tools-gitlab] Creating MR in project ${projectId}: ${data.title}`);

    try {
      const response = await this.client.post(`/api/v4/projects/${projectId}/merge_requests`, {
        title: data.title,
        source_branch: data.sourceBranch,
        target_branch: data.targetBranch,
        description: data.description,
      });

      const mr = response.data;
      return {
        id: mr.id,
        iid: mr.iid,
        projectId: mr.project_id,
        title: mr.title,
        description: mr.description || undefined,
        sourceBranch: mr.source_branch,
        targetBranch: mr.target_branch,
        state: mr.state,
        author: mr.author?.name || 'Unknown',
        createdAt: mr.created_at,
        updatedAt: mr.updated_at,
        webUrl: mr.web_url,
      };
    } catch (err: any) {
      console.error(`[@uclaw/tools-gitlab] Create MR Error:`, err.message);
      if (err.response) {
        console.error(`[@uclaw/tools-gitlab] Full Error Response:`, JSON.stringify(err.response.data, null, 2));
      }
      throw err;
    }
  }

  /**
   * 获取 MR 变更文件
   */
  async getMRChanges(projectId: number, mrIid: number): Promise<GitLabChange[]> {
    console.log(`[@uclaw/tools-gitlab] Getting changes for MR !${mrIid} in project ${projectId}`);

    try {
      const response = await this.client.get(`/api/v4/projects/${projectId}/merge_requests/${mrIid}/changes`);

      return response.data.changes.map((change: any) => ({
        oldPath: change.old_path,
        newPath: change.new_path,
        aMode: change.a_mode || '0',
        bMode: change.b_mode || '0',
        diff: change.diff || '',
        newFile: change.new_file || false,
        renamedFile: change.renamed_file || false,
        deletedFile: change.deleted_file || false,
      }));
    } catch (err: any) {
      console.error(`[@uclaw/tools-gitlab] Get MR Changes Error:`, err.message);
      if (err.response) {
        console.error(`[@uclaw/tools-gitlab] Status:`, err.response.status, JSON.stringify(err.response.data));
      }
      return [];
    }
  }

  /**
   * 添加 Review 评论
   */
  async addReviewComment(
    projectId: number,
    mrIid: number,
    data: {
      body: string;
      path?: string;
      line?: number;
    },
  ): Promise<boolean> {
    console.log(`[@uclaw/tools-gitlab] Adding comment to MR !${mrIid} in project ${projectId}`);

    try {
      await this.client.post(`/api/v4/projects/${projectId}/merge_requests/${mrIid}/notes`, {
        body: data.body,
        ...(data.path && { position: { base_sha: 'HEAD', start_sha: 'HEAD', head_sha: 'HEAD', position_type: 'text', new_path: data.path, new_line: data.line } }),
      });
      return true;
    } catch (err: any) {
      console.error(`[@uclaw/tools-gitlab] Add Review Comment Error:`, err.message);
      if (err.response) {
        console.error(`[@uclaw/tools-gitlab] Status:`, err.response.status, JSON.stringify(err.response.data));
      }
      return false;
    }
  }

  /**
   * 合并 MR
   */
  async mergeMR(
    projectId: number,
    mrIid: number,
    message?: string,
  ): Promise<boolean> {
    console.log(`[@uclaw/tools-gitlab] Merging MR !${mrIid} in project ${projectId}`);

    try {
      await this.client.put(`/api/v4/projects/${projectId}/merge_requests/${mrIid}/merge`, {
        merge_commit_message: message,
      });
      return true;
    } catch (err: any) {
      console.error(`[@uclaw/tools-gitlab] Merge MR Error:`, err.message);
      if (err.response) {
        console.error(`[@uclaw/tools-gitlab] Status:`, err.response.status, JSON.stringify(err.response.data));
      }
      return false;
    }
  }
}
