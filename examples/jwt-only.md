# JWT-Only Setup Guide

Use this if you already have a Paper.id JWT and don't want to store credentials.

> **Trade-off**: JWT expires (~30 days). You must update it manually.  
> Want auto-refresh? Use `PAPERID_PHONE` + `PAPERID_PASSWORD` instead.

---

## Step 1 — Get Your JWT Token

1. Open **[app.paper.id](https://app.paper.id)** in Chrome and log in
2. Open **DevTools** → **Network** tab (`F12` → Network)
3. Click anything in the app (e.g. open the invoice list)
4. In the network panel, click **any request** to `api.paper.id`
5. Go to **Headers** → **Request Headers**
6. Find `Authorization: Bearer eyJ...`
7. Copy everything **after** `Bearer ` — that's your token

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpb...
                      ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                      copy this part only
```

---

## Step 2 — Get Your Company ID and User ID

From the same DevTools window:

1. Click any request to `api.paper.id` that returns user/company data  
   (e.g. `GET /api/v1/users/me` or any invoice request)
2. Go to **Response** tab → look for:

```json
{
  "body": {
    "user": {
      "uuid": "3f5a9896-xxxx-xxxx-xxxx-xxxxxxxxxxxx",   ← PAPERID_USER_ID
      "company_id": "37e0eae0-xxxx-xxxx-xxxx-xxxxxxxxxxxx"  ← PAPERID_COMPANY_ID
    }
  }
}
```

**Shortcut**: After setting `PAPERID_TOKEN`, call the `paperid_get_current_user` tool — it returns both IDs so you can fill them in.

---

## Step 3 — Configure Your MCP Client

Pick the config block for your client below. Replace the three placeholder values.

### Claude Desktop

File: `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS)  
File: `%APPDATA%\Claude\claude_desktop_config.json` (Windows)

```json
{
  "mcpServers": {
    "paperid": {
      "command": "node",
      "args": ["/absolute/path/to/paper-invoice-mcp/dist/index.js"],
      "env": {
        "PAPERID_TOKEN":      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.your.token",
        "PAPERID_COMPANY_ID": "37e0eae0-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
        "PAPERID_USER_ID":    "3f5a9896-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
      }
    }
  }
}
```

> Restart Claude Desktop after saving.

---

### Cursor

File: `.cursor/mcp.json` in your project root, **or** `~/.cursor/mcp.json` globally

```json
{
  "mcpServers": {
    "paperid": {
      "command": "node",
      "args": ["/absolute/path/to/paper-invoice-mcp/dist/index.js"],
      "env": {
        "PAPERID_TOKEN":      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.your.token",
        "PAPERID_COMPANY_ID": "37e0eae0-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
        "PAPERID_USER_ID":    "3f5a9896-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
      }
    }
  }
}
```

> Open **Command Palette → MCP: Reload Servers** after saving.

---

### VS Code (Copilot / Continue / other MCP extension)

File: `.vscode/mcp.json` in project root

```json
{
  "servers": {
    "paperid": {
      "type": "stdio",
      "command": "node",
      "args": ["/absolute/path/to/paper-invoice-mcp/dist/index.js"],
      "env": {
        "PAPERID_TOKEN":      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.your.token",
        "PAPERID_COMPANY_ID": "37e0eae0-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
        "PAPERID_USER_ID":    "3f5a9896-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
      }
    }
  }
}
```

---

### Bun (skip compile step)

```json
{
  "mcpServers": {
    "paperid": {
      "command": "bun",
      "args": ["run", "/absolute/path/to/paper-invoice-mcp/src/index.ts"],
      "env": {
        "PAPERID_TOKEN":      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.your.token",
        "PAPERID_COMPANY_ID": "37e0eae0-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
        "PAPERID_USER_ID":    "3f5a9896-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
      }
    }
  }
}
```

> Requires [Bun](https://bun.sh) installed. No build step needed.

---

### npx (no install)

```json
{
  "mcpServers": {
    "paperid": {
      "command": "npx",
      "args": ["-y", "paper-invoice-mcp"],
      "env": {
        "PAPERID_TOKEN":      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.your.token",
        "PAPERID_COMPANY_ID": "37e0eae0-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
        "PAPERID_USER_ID":    "3f5a9896-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
      }
    }
  }
}
```

> Only works once the package is published to npm.

---

## Step 4 — Verify It Works

Ask your AI assistant:
```
Call paperid_get_token_info
```

Expected response:
```json
{
  "phone": null,
  "user_id": "3f5a9896-...",
  "company_id": "37e0eae0-...",
  "expires_at": 1778830204,
  "expires_at_iso": "2026-07-11T14:30:04.000Z",
  "is_expired": false,
  "source": "env"
}
```

If `is_expired: true` → [refresh the token](#when-token-expires).

---

## When Token Expires

JWT from Paper.id expires after **30 days** (remember me) or **24 hours** (normal login).

**How to refresh:**

1. Log in to [app.paper.id](https://app.paper.id) in Chrome
2. Open DevTools → Network → click any API request
3. Copy the new `Authorization: Bearer eyJ...` value
4. Update `PAPERID_TOKEN` in your MCP config file
5. Restart your MCP client (Claude Desktop / Cursor / VS Code)

**Check expiry before it happens:**
```
Call paperid_get_token_info → check expires_at_iso
```

---

## JWT-only vs Phone+Password

| | JWT-only | Phone + Password |
|---|---|---|
| Setup effort | Copy token from DevTools | Set 2 env vars |
| Auto-refresh on expiry | ❌ Manual | ✅ Automatic |
| Token storage | `PAPERID_TOKEN` env var | SQLite `~/.paperid-mcp/tokens.db` |
| Credentials in config | JWT token | Phone + password |
| Best for | Quick testing · CI with short-lived tokens | Long-running assistants |

---

## Troubleshooting

**`401 Unauthorized`** — Token expired. Get a new one from DevTools.

**`Cannot read company`** — `PAPERID_COMPANY_ID` wrong or missing. Call `paperid_get_current_user` to confirm the correct value.

**`Tool not found`** — MCP server not connected. Check the `args` path points to the compiled `dist/index.js` and the file exists.

**`Error: ENOENT dist/index.js`** — Run `npm run build` (or `bun run build`) first.
