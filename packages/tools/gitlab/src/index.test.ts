import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GitLabTool } from '../src/index';
import axios from 'axios';

// Mock axios
vi.mock('axios');

describe('GitLabTool', () => {
  let gitlab: GitLabTool;
  const mockAxiosInstance = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(axios.create).mockReturnValue(mockAxiosInstance as any);
    
    gitlab = new GitLabTool({
      baseUrl: 'https://gitlab.example.com',
      token: 'test-token',
    });
  });

  describe('listProjects', () => {
    it('should return projects when API succeeds', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: [
          {
            id: 1,
            name: 'uclaw',
            path_with_namespace: 'uclaw/uclaw',
            description: 'UClaw main repo',
            web_url: 'https://gitlab.example.com/uclaw/uclaw',
            default_branch: 'main',
          },
        ],
      });

      const projects = await gitlab.listProjects();
      expect(projects).toHaveLength(1);
      expect(projects[0].name).toBe('uclaw');
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/api/v4/projects', { params: {} });
    });

    it('should return empty array when API fails', async () => {
      mockAxiosInstance.get.mockRejectedValue(new Error('Network error'));

      const projects = await gitlab.listProjects();
      expect(projects).toEqual([]);
    });

    it('should pass search parameter', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: [] });

      await gitlab.listProjects('uclaw');
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/api/v4/projects', { params: { search: 'uclaw' } });
    });
  });

  describe('listMRs', () => {
    it('should return merge requests', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: [
          {
            id: 101,
            iid: 45,
            project_id: 1,
            title: 'feat: add feature',
            source_branch: 'feature/branch',
            target_branch: 'main',
            state: 'opened',
            author: { name: '张三' },
            created_at: '2026-04-13T09:00:00Z',
            updated_at: '2026-04-13T10:00:00Z',
            web_url: 'https://gitlab.example.com/-/merge_requests/45',
          },
        ],
      });

      const mrs = await gitlab.listMRs(1);
      expect(mrs).toHaveLength(1);
      expect(mrs[0].title).toBe('feat: add feature');
      expect(mrs[0].author).toBe('张三');
    });

    it('should filter by state', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: [] });

      await gitlab.listMRs(1, 'opened');
      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/api/v4/projects/1/merge_requests',
        { params: { state: 'opened' } }
      );
    });
  });

  describe('createMR', () => {
    it('should create merge request successfully', async () => {
      mockAxiosInstance.post.mockResolvedValue({
        data: {
          id: 102,
          iid: 46,
          project_id: 1,
          title: 'New MR',
          source_branch: 'dev',
          target_branch: 'main',
          state: 'opened',
          author: { name: 'Test' },
          created_at: '2026-04-13T09:00:00Z',
          updated_at: '2026-04-13T09:00:00Z',
          web_url: 'https://gitlab.example.com/-/merge_requests/46',
        },
      });

      const mr = await gitlab.createMR(1, {
        title: 'New MR',
        sourceBranch: 'dev',
        targetBranch: 'main',
      });
      expect(mr.title).toBe('New MR');
      expect(mr.iid).toBe(46);
    });
  });

  describe('getMRChanges', () => {
    it('should return change list', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: {
          changes: [
            {
              old_path: '/dev/null',
              new_path: 'src/test.ts',
              a_mode: '0',
              b_mode: '100644',
              diff: '+new file',
              new_file: true,
              renamed_file: false,
              deleted_file: false,
            },
          ],
        },
      });

      const changes = await gitlab.getMRChanges(1, 45);
      expect(changes).toHaveLength(1);
      expect(changes[0].newPath).toBe('src/test.ts');
      expect(changes[0].newFile).toBe(true);
    });
  });

  describe('mergeMR', () => {
    it('should return true on success', async () => {
      mockAxiosInstance.put.mockResolvedValue({ data: {} });

      const result = await gitlab.mergeMR(1, 45);
      expect(result).toBe(true);
    });

    it('should return false on failure', async () => {
      mockAxiosInstance.put.mockRejectedValue(new Error('Conflict'));

      const result = await gitlab.mergeMR(1, 45);
      expect(result).toBe(false);
    });
  });
});
