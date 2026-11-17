# Gateway MCP OAuth

OAuth providers are configured by the Gateway administrator, independently of
workspace MCP configuration. Tokens are never returned by the HTTP API.

## Configuration

Set `OCEAN_MCP_OAUTH_KEY` to a persistent base64-encoded random 32-byte key.
Keep this key in the deployment secret store. Changing it makes existing records
unreadable; users must authorize again. All Gateway replicas sharing the OAuth
store must use the same key.

`OCEAN_MCP_OAUTH_ROOT` selects the private credential directory (default:
`~/.ocean/oauth`). The directory must have mode 0700. Records are AES-256-GCM
encrypted with record identity as authenticated data and written atomically with
mode 0600 and file/directory fsync.

`OCEAN_MCP_OAUTH_SERVERS` is a JSON object keyed by MCP server ID:

```json
{
  "example": {
    "serverUrl": "https://mcp.example.com/mcp",
    "authorizationUrl": "https://auth.example.com/authorize",
    "tokenUrl": "https://auth.example.com/token",
    "redirectUri": "https://ocean.example.com/api/mcp-oauth/callback",
    "clientId": "registered-ocean-client",
    "scope": "tools"
  }
}
```

Register the exact redirect URI with the provider. A confidential client may add
`clientSecret`; token requests use client_secret_post. HTTPS is required except
for loopback development URLs. Metadata discovery and dynamic registration are
not implemented; endpoints and the client must be preconfigured.

## Flow

1. An authenticated client POSTs `/api/mcp-oauth/:serverId/authorize` and opens
   the returned `authorizationUrl`. User identity comes exclusively from auth.
2. The provider redirects to `/api/mcp-oauth/callback?state=…&code=…`.
   The callback is public but consumes an unpredictable, encrypted, ten-minute,
   single-use state record bound to the initiating user, provider configuration,
   PKCE verifier and revocation epoch.
3. Tenant MCP HTTP/SSE requests acquire their bearer token from this store.
   Expired tokens refresh under a cross-process lock; rotated refresh tokens
   are persisted before the lock is released. Redirects and cross-origin
   transport requests are rejected. Tool requests are not replayed after 401.
4. Authenticated DELETE `/api/mcp-oauth/:serverId` removes local tokens and
   invalidates pending authorization callbacks using a persistent epoch.
   This is local disconnection, not provider-side token revocation.

Locks use exclusive directories and bounded waits. A process killed while
holding a lock leaves that scope blocked rather than risking concurrent refresh
of a rotating token. An operator must verify the owner is gone before removing
an abandoned `.lock` directory. Shared storage must support atomic mkdir/rename.
