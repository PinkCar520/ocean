/**
 * API Request Utility
 * Centralizes authentication and base fetch logic.
 */

export function getAuthHeaders(token?: string | null): Record<string, string> {
  const headers: Record<string, string> = {};
  
  // 优先使用传入的 token，否则从 localStorage 实时获取
  const activeToken = token || localStorage.getItem('uclaw_auth_token');
  
  if (activeToken) {
    headers['Authorization'] = `Bearer ${activeToken}`;
  }
  
  const uid = localStorage.getItem('uclaw_user_id');
  if (uid) {
    headers['X-User-Id'] = uid;
  }
  
  return headers;
}

/**
 * Enhanced fetch wrapper that automatically adds auth headers
 */
export async function apiFetch(
  url: string,
  options: RequestInit = {},
  token?: string | null
): Promise<Response> {
  const headers = {
    ...getAuthHeaders(token),
    ...(options.headers as Record<string, string> || {}),
  };

  return fetch(url, {
    ...options,
    headers,
  });
}
