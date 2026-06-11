import axios, { AxiosInstance, AxiosResponse } from 'axios';

/**
 * GitLab 生产化配置
 */
export interface GitLabConfig {
  baseUrl: string;
  token: string;
  timeout?: number;
}

// ──────────────────────────────────────────────
// 强类型定义
// ──────────────────────────────────────────────

export interface GitLabProject {
  id: number;
  name: string;
  pathWithNamespace: string;
  description?: string;
  webUrl: string;
  defaultBranch: string;
  visibility: 'private' | 'internal' | 'public';
}

export interface GitLabBranch {
  name: string;
  merged: boolean;
  protected: boolean;
  webUrl: string;
}

export interface GitLabIssue {
  id: number;
  iid: number;
  projectId: number;
  title: string;
  description: string;
  state: 'opened' | 'closed';
  assignee?: string;
  labels: string[];
  webUrl: string;
}

export interface GitLabPipeline {
  id: number;
  iid: number;
  projectId: number;
  status: 'running' | 'pending' | 'success' | 'failed' | 'canceled' | 'skipped' | 'manual';
  ref: string;
  webUrl: string;
}

export interface GitLabJob {
  id: number;
  name: string;
  stage: string;
  status: string;
}

export interface GitLabMR {
  id: number;
  iid: number;
  projectId: number;
  title: string;
  sourceBranch: string;
  targetBranch: string;
  state: 'opened' | 'merged' | 'closed';
  webUrl: string;
}

/**
 * GitLab 生产化工具库
 * 支持：分页自适应、结构化错误抛出、全量常用 API
 */
export class GitLabTool {
  private client: AxiosInstance;

  constructor(config: GitLabConfig) {
    this.client = axios.create({
      baseURL: config.baseUrl.replace(/\/+$/, ''),
      headers: {
        'PRIVATE-TOKEN': config.token,
        'Content-Type': 'application/json',
      },
      timeout: config.timeout || 15000,
    });
  }

  /**
   * 通用分页获取逻辑
   */
  private async fetchAll<T>(url: string, params: any = {}): Promise<T[]> {
    let allData: T[] = [];
    let page = 1;
    const perPage = 100;

    try {
      while (true) {
        const response: AxiosResponse<T[]> = await this.client.get(url, {
          params: { ...params, page, per_page: perPage },
        });
        allData = allData.concat(response.data);
        const nextPage = response.headers['x-next-page'];
        if (!nextPage || nextPage === '') break;
        page = parseInt(nextPage);
      }
      return allData;
    } catch (err: any) {
      this.handleError('FetchAll', err);
      return [];
    }
  }

  private handleError(operation: string, err: any) {
    const status = err.response?.status;
    const message = err.response?.data?.message || err.message;
    console.error(`[@ocean/tools-gitlab] ${operation} Failed [${status}]: ${JSON.stringify(message)}`);
    throw new Error(`GitLab ${operation} Error: ${status} - ${JSON.stringify(message)}`);
  }

  // ──────────────────────────────────────────────
  // 1. 项目管理 (Project Management)
  // ──────────────────────────────────────────────

  async listProjects(search?: string): Promise<GitLabProject[]> {
    const data = await this.fetchAll<any>('/api/v4/projects', {
      search,
      membership: true,
      order_by: 'last_activity_at',
    });
    return data.map(p => ({
      id: p.id,
      name: p.name,
      pathWithNamespace: p.path_with_namespace,
      description: p.description,
      webUrl: p.web_url,
      defaultBranch: p.default_branch || 'main',
      visibility: p.visibility,
    }));
  }

  async createProject(params: { name: string; description?: string; visibility?: 'private' | 'internal' | 'public' }): Promise<GitLabProject> {
    try {
      const res = await this.client.post('/api/v4/projects', params);
      return {
        id: res.data.id,
        name: res.data.name,
        pathWithNamespace: res.data.path_with_namespace,
        webUrl: res.data.web_url,
        defaultBranch: res.data.default_branch || 'main',
        visibility: res.data.visibility,
      };
    } catch (err) {
      this.handleError('CreateProject', err);
      throw err;
    }
  }

  async deleteProject(projectId: number): Promise<void> {
    try {
      await this.client.delete(`/api/v4/projects/${projectId}`);
    } catch (err) {
      this.handleError('DeleteProject', err);
    }
  }

  // ──────────────────────────────────────────────
  // 2. 仓库管理 (Repository Management)
  // ──────────────────────────────────────────────

  async listBranches(projectId: number): Promise<GitLabBranch[]> {
    const data = await this.fetchAll<any>(`/api/v4/projects/${projectId}/repository/branches`);
    return data.map(b => ({
      name: b.name,
      merged: b.merged,
      protected: b.protected,
      webUrl: b.web_url,
    }));
  }

  async createBranch(projectId: number, branch: string, ref: string): Promise<GitLabBranch> {
    try {
      const res = await this.client.post(`/api/v4/projects/${projectId}/repository/branches`, { branch, ref });
      return {
        name: res.data.name,
        merged: res.data.merged,
        protected: res.data.protected,
        webUrl: res.data.web_url,
      };
    } catch (err) {
      this.handleError('CreateBranch', err);
      throw err;
    }
  }

  async getFileRaw(projectId: number, filePath: string, ref: string): Promise<string> {
    try {
      const res = await this.client.get(`/api/v4/projects/${projectId}/repository/files/${encodeURIComponent(filePath)}/raw`, {
        params: { ref },
      });
      return typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
    } catch (err) {
      this.handleError('GetFileRaw', err);
      throw err;
    }
  }

  // ──────────────────────────────────────────────
  // 3. 合并请求 (Merge Requests)
  // ──────────────────────────────────────────────

  async listMRs(projectId: number, state: 'opened' | 'merged' | 'closed' | 'all' = 'opened'): Promise<GitLabMR[]> {
    const data = await this.fetchAll<any>(`/api/v4/projects/${projectId}/merge_requests`, { state });
    return data.map(m => ({
      id: m.id,
      iid: m.iid,
      projectId: m.project_id,
      title: m.title,
      sourceBranch: m.source_branch,
      targetBranch: m.target_branch,
      state: m.state,
      webUrl: m.web_url,
    }));
  }

  async createMR(projectId: number, data: { title: string; sourceBranch: string; targetBranch: string; description?: string }): Promise<GitLabMR> {
    try {
      const res = await this.client.post(`/api/v4/projects/${projectId}/merge_requests`, {
        title: data.title,
        source_branch: data.sourceBranch,
        target_branch: data.targetBranch,
        description: data.description,
      });
      return {
        id: res.data.id,
        iid: res.data.iid,
        projectId: res.data.project_id,
        title: res.data.title,
        sourceBranch: res.data.source_branch,
        targetBranch: res.data.target_branch,
        state: res.data.state,
        webUrl: res.data.web_url,
      };
    } catch (err) {
      this.handleError('CreateMR', err);
      throw err;
    }
  }

  async mergeMR(projectId: number, mrIid: number, message?: string): Promise<void> {
    try {
      await this.client.put(`/api/v4/projects/${projectId}/merge_requests/${mrIid}/merge`, { merge_commit_message: message });
    } catch (err) {
      this.handleError('MergeMR', err);
    }
  }

  // ──────────────────────────────────────────────
  // 4. 需求/缺陷管理 (Issues)
  // ──────────────────────────────────────────────

  async listIssues(projectId: number, state: 'opened' | 'closed' = 'opened'): Promise<GitLabIssue[]> {
    const data = await this.fetchAll<any>(`/api/v4/projects/${projectId}/issues`, { state });
    return data.map(i => ({
      id: i.id,
      iid: i.iid,
      projectId: i.project_id,
      title: i.title,
      description: i.description,
      state: i.state,
      assignee: i.assignee?.name,
      labels: i.labels,
      webUrl: i.web_url,
    }));
  }

  async createIssue(projectId: number, data: { title: string; description?: string; labels?: string[] }): Promise<GitLabIssue> {
    try {
      const res = await this.client.post(`/api/v4/projects/${projectId}/issues`, data);
      return {
        id: res.data.id,
        iid: res.data.iid,
        projectId: res.data.project_id,
        title: res.data.title,
        description: res.data.description,
        state: res.data.state,
        labels: res.data.labels,
        webUrl: res.data.web_url,
      };
    } catch (err) {
      this.handleError('CreateIssue', err);
      throw err;
    }
  }

  // ──────────────────────────────────────────────
  // 5. CI/CD (Pipelines & Jobs)
  // ──────────────────────────────────────────────

  async listPipelines(projectId: number): Promise<GitLabPipeline[]> {
    const data = await this.fetchAll<any>(`/api/v4/projects/${projectId}/pipelines`);
    return data.map(p => ({
      id: p.id,
      iid: p.iid,
      projectId: p.project_id,
      status: p.status,
      ref: p.ref,
      webUrl: p.web_url,
    }));
  }

  async getPipelineJobs(projectId: number, pipelineId: number): Promise<GitLabJob[]> {
    try {
      const res = await this.client.get(`/api/v4/projects/${projectId}/pipelines/${pipelineId}/jobs`);
      return res.data.map((j: any) => ({
        id: j.id,
        name: j.name,
        stage: j.stage,
        status: j.status,
      }));
    } catch (err) {
      this.handleError('GetPipelineJobs', err);
      return [];
    }
  }

  async getJobLog(projectId: number, jobId: number): Promise<string> {
    try {
      const res = await this.client.get(`/api/v4/projects/${projectId}/jobs/${jobId}/trace`);
      return res.data;
    } catch (err) {
      this.handleError('GetJobLog', err);
      throw err;
    }
  }

  async retryPipeline(projectId: number, pipelineId: number): Promise<void> {
    try {
      await this.client.post(`/api/v4/projects/${projectId}/pipelines/${pipelineId}/retry`);
    } catch (err) {
      this.handleError('RetryPipeline', err);
    }
  }
}
