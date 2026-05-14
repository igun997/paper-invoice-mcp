# Using paper-invoice-mcp with JWT Token Only

Use this approach if you already have a JWT token from Paper.id
and don't want to store credentials in env.

> **Note**: JWT from Paper.id expires. When it expires, you must supply a new token manually.
> For automatic refresh, use `PAPERID_PHONE` + `PAPERID_PASSWORD` instead.

---

## How to Get Your JWT Token

1. Open [app.paper.id](https://app.paper.id) in Chrome
2. Open DevTools → Network tab
3. Perform any action (e.g. open invoice list)
4. Click any API request to `api.paper.id`
5. Copy the `Authorization: Bearer eyJ...` header value (without the `Bearer ` prefix)

---

## Claude Desktop (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "paperid": {
      "command": "node",
      "args": ["/absolute/path/to/paper-invoice-mcp/dist/index.js"],
      "env": {
        "PAPERID_TOKEN": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.your.token",
        "PAPERID_COMPANY_ID": "your-company-uuid",
        "PAPERID_USER_ID": "your-user-uuid"
      }
    }
  }
}
```

---

## Cursor / VS Code (`.cursor/mcp.json` or `.vscode/mcp.json`)

```json
{
  "mcpServers": {
    "paperid": {
      "command": "node",
      "args": ["/absolute/path/to/paper-invoice-mcp/dist/index.js"],
      "env": {
        "PAPERID_TOKEN": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.your.token",
        "PAPERID_COMPANY_ID": "your-company-uuid",
        "PAPERID_USER_ID": "your-user-uuid"
      }
    }
  }
}
```

---

## Bun (no compile step)

```json
{
  "mcpServers": {
    "paperid": {
      "command": "bun",
      "args": ["run", "/absolute/path/to/paper-invoice-mcp/src/index.ts"],
      "env": {
        "PAPERID_TOKEN": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.your.token",
        "PAPERID_COMPANY_ID": "your-company-uuid",
        "PAPERID_USER_ID": "your-user-uuid"
      }
    }
  }
}
```

---

## Where to Find company_id and user_id

From the same DevTools request — look at the request URL or response body:

- **company_id**: appears in URLs like `/api/v1/companies/{uuid}` or in response `body.company.uuid`
- **user_id**: appears in `/api/v1/users/{uuid}` or response `body.uuid`

Or call `paperid_get_current_user` tool after setting the token — it returns both.

---

## Token Expiry

JWT tokens from Paper.id typically expire in **30 days** (remember_me) or **24 hours** (normal login).

Check expiry with the tool:
```
paperid_get_token_info
```

Returns:
```json
{
  "expires_at_human": "2026-06-13T14:30:04.000Z",
  "is_expired": false
}
```

When expired → grab a new token from DevTools and update your MCP config.

---

## Comparison: JWT-only vs Phone+Password

| | JWT-only | Phone + Password |
|---|---|---|
| Setup | Grab token from DevTools | Set env vars |
| Auto-refresh | ❌ Manual | ✅ Automatic on 401 |
| Token persistence | In-memory only | SQLite (`~/.paperid-mcp/tokens.db`) |
| Security | Token in config file | Password in config file |
| Best for | Quick testing, CI/CD with short-lived tokens | Long-running assistants |
