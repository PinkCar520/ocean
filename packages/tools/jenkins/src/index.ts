import axios, { AxiosInstance } from 'axios';

export interface JenkinsConfig {
  baseUrl: string;
  token: string;
  username?: string;
}

export interface JenkinsBuild {
  id: string;
  number: number;
  status: 'success' | 'failure' | 'running' | 'queued' | 'aborted';
  jobName: string;
  startTime: string;
  duration?: number;
  url: string;
}

export interface JenkinsJob {
  name: string;
  fullName: string;
  url: string;
  description?: string;
  color: 'blue' | 'red' | 'yellow' | 'grey' | 'disabled' | 'aborted';
  lastBuild?: JenkinsBuild;
}

export class JenkinsTool {
  private client: AxiosInstance;
  private username: string;
  private token: string;

  constructor(config: JenkinsConfig) {
    this.username = config.username || '';
    this.token = config.token;

    // Jenkins 使用 API Token 认证，支持 Basic Auth
    const auth = Buffer.from(`${this.username}:${this.token}`).toString('base64');

    this.client = axios.create({
      baseURL: config.baseUrl.replace(/\/+$/, ''),
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000, // Jenkins 构建可能需要较长时间
    });
  }

  /**
   * 列出所有任务
   */
  async listJobs(): Promise<JenkinsJob[]> {
    console.log(`[@uclaw/tools-jenkins] Listing jobs`);

    try {
      const response = await this.client.get('/api/json', {
        params: { tree: 'jobs[name,fullName,url,color,description,lastBuild[number,id,timestamp,duration,result,url]]' },
      });

      return response.data.jobs.map((job: any) => ({
        name: job.name,
        fullName: job.fullName || job.name,
        url: job.url,
        description: job.description || undefined,
        color: job.color || 'grey',
        lastBuild: job.lastBuild ? {
          id: String(job.lastBuild.id),
          number: job.lastBuild.number,
          status: this.mapBuildStatus(job.lastBuild.result),
          jobName: job.name,
          startTime: new Date(job.lastBuild.timestamp).toISOString(),
          duration: job.lastBuild.duration,
          url: job.lastBuild.url,
        } : undefined,
      }));
    } catch (err: any) {
      console.error(`[@uclaw/tools-jenkins] List Jobs Error:`, err.message);
      if (err.response) {
        console.error(`[@uclaw/tools-jenkins] Status:`, err.response.status, JSON.stringify(err.response.data));
      }
      return [];
    }
  }

  /**
   * 获取任务详情
   */
  async getJobInfo(jobName: string): Promise<JenkinsJob | null> {
    console.log(`[@uclaw/tools-jenkins] Getting job info: ${jobName}`);

    try {
      const response = await this.client.get(`/job/${this.encodeJobName(jobName)}/api/json`, {
        params: { tree: 'name,fullName,url,color,description,lastBuild[number,id,timestamp,duration,result,url]' },
      });

      const job = response.data;
      return {
        name: job.name,
        fullName: job.fullName || job.name,
        url: job.url,
        description: job.description || undefined,
        color: job.color || 'grey',
        lastBuild: job.lastBuild ? {
          id: String(job.lastBuild.id),
          number: job.lastBuild.number,
          status: this.mapBuildStatus(job.lastBuild.result),
          jobName: job.name,
          startTime: new Date(job.lastBuild.timestamp).toISOString(),
          duration: job.lastBuild.duration,
          url: job.lastBuild.url,
        } : undefined,
      };
    } catch (err: any) {
      console.error(`[@uclaw/tools-jenkins] Get Job Info Error:`, err.message);
      if (err.response && err.response.status === 404) {
        return null;
      }
      return null;
    }
  }

  /**
   * 获取构建状态
   */
  async getBuildStatus(jobName: string, buildNumber?: number): Promise<JenkinsBuild | null> {
    console.log(`[@uclaw/tools-jenkins] Getting build status: ${jobName}${buildNumber ? ` #${buildNumber}` : ''}`);

    try {
      const buildNum = buildNumber || 'lastBuild';
      const response = await this.client.get(`/job/${this.encodeJobName(jobName)}/${buildNumber !== undefined ? buildNumber : 'lastBuild'}/api/json`, {
        params: { tree: 'number,id,timestamp,duration,result,url,fullDisplayName' },
      });

      const build = response.data;
      return {
        id: String(build.id),
        number: build.number,
        status: this.mapBuildStatus(build.result),
        jobName: jobName,
        startTime: new Date(build.timestamp).toISOString(),
        duration: build.duration,
        url: build.url,
      };
    } catch (err: any) {
      console.error(`[@uclaw/tools-jenkins] Get Build Status Error:`, err.message);
      if (err.response && err.response.status === 404) {
        return null;
      }
      return null;
    }
  }

  /**
   * 触发构建
   */
  async triggerBuild(jobName: string, params?: Record<string, string>): Promise<{ success: boolean; buildNumber?: number; queueUrl?: string }> {
    console.log(`[@uclaw/tools-jenkins] Triggering build: ${jobName}${params ? ' with params' : ''}`);

    try {
      const endpoint = params
        ? `/job/${this.encodeJobName(jobName)}/buildWithParameters`
        : `/job/${this.encodeJobName(jobName)}/build`;

      const response = await this.client.post(endpoint, params, {
        maxRedirects: 0,
        validateStatus: (status) => status >= 200 && status < 400, // 接受 201 和 302
      });

      // Jenkins 返回 201 Created 或 302 Found，队列 URL 在 Location header 中
      const queueUrl = response.headers['location'];
      let buildNumber: number | undefined;

      // 尝试从队列 URL 提取构建号（需要轮询）
      if (queueUrl) {
        console.log(`[@uclaw/tools-jenkins] Build queued, queue URL: ${queueUrl}`);
      }

      return { success: true, queueUrl };
    } catch (err: any) {
      console.error(`[@uclaw/tools-jenkins] Trigger Build Error:`, err.message);
      if (err.response) {
        console.error(`[@uclaw/tools-jenkins] Status:`, err.response.status, JSON.stringify(err.response.data));
      }
      return { success: false };
    }
  }

  /**
   * 获取构建日志
   */
  async getBuildLog(jobName: string, buildNumber: number): Promise<string> {
    console.log(`[@uclaw/tools-jenkins] Getting build log: ${jobName} #${buildNumber}`);

    try {
      const response = await this.client.get(`/job/${this.encodeJobName(jobName)}/${buildNumber}/consoleText`, {
        responseType: 'text',
      });

      return response.data;
    } catch (err: any) {
      console.error(`[@uclaw/tools-jenkins] Get Build Log Error:`, err.message);
      if (err.response) {
        console.error(`[@uclaw/tools-jenkins] Status:`, err.response.status);
      }
      return '';
    }
  }

  /**
   * 审批部署
   * 注意：Jenkins 的审批通常通过 Input Step 实现，这里通过 API 提交审批
   */
  async approveDeployment(buildNumber: number, approved: boolean, comment?: string): Promise<boolean> {
    console.log(`[@uclaw/tools-jenkins] ${approved ? 'Approving' : 'Rejecting'} deployment #${buildNumber}`);

    try {
      // Jenkins 的 Input Step 审批 API
      // 这需要根据实际的 Jenkins Pipeline Input Step 配置进行调整
      const action = approved ? 'proceed' : 'abort';
      await this.client.post(`/job/deploy-pipeline/${buildNumber}/input/${action}`, {
        message: comment || '',
      });
      return true;
    } catch (err: any) {
      console.error(`[@uclaw/tools-jenkins] Approve Deployment Error:`, err.message);
      if (err.response) {
        console.error(`[@uclaw/tools-jenkins] Status:`, err.response.status, JSON.stringify(err.response.data));
      }
      return false;
    }
  }

  /**
   * 映射构建状态
   */
  private mapBuildStatus(result: string | null | undefined): 'success' | 'failure' | 'running' | 'queued' | 'aborted' {
    if (!result || result === 'null') return 'running';
    switch (result.toLowerCase()) {
      case 'success':
      case 'stable':
        return 'success';
      case 'failure':
      case 'unstable':
        return 'failure';
      case 'aborted':
        return 'aborted';
      case 'queued':
      case 'waiting':
        return 'queued';
      default:
        return 'running';
    }
  }

  /**
   * 编码任务名称（处理特殊字符）
   */
  private encodeJobName(jobName: string): string {
    // Jenkins API 要求路径中的斜杠用 %2F 编码
    return jobName.replace(/\//g, '%2F');
  }
}
