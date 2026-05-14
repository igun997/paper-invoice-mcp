# paper-invoice-mcp

MCP (Model Context Protocol) server for [Paper.id](https://paper.id) — Indonesian invoicing & accounting platform.

Exposes 31 tools covering partner CRUD, invoice CRUD, send invoice, QRIS payment, and reporting.  
Token is **persisted in SQLite** and **auto-refreshed on 401** — no manual token management needed.

---

## Quick Setup

### Option A — JWT token only

Best for quick testing or CI. No password stored — just paste your token.

**1. Get your token from Chrome DevTools:**
- Open [app.paper.id](https://app.paper.id) → DevTools (`F12`) → Network tab
- Click any request to `api.paper.id` → Headers → Request Headers
- Copy the value after `Authorization: Bearer ` (the `eyJ...` part)

**2. Get your Company ID and User ID:**
- Same DevTools window → Response tab of any request
- Look for `body.user.uuid` (User ID) and `body.user.company_id` (Company ID)
- Or: set `PAPERID_TOKEN` first, then call tool `paperid_get_current_user` — it returns both

**3. Add to your MCP client config:**

**Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json`)
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

**Cursor** (`.cursor/mcp.json` or `~/.cursor/mcp.json`)
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

**VS Code** (`.vscode/mcp.json`)
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

> JWT expires in ~30 days. When it does, copy a fresh token from DevTools and update the config.  
> Full step-by-step with troubleshooting: [`examples/jwt-only.md`](examples/jwt-only.md)

---

### Option B — Phone + Password (auto-refresh)

Best for long-running assistants. Token saved to SQLite, silently refreshed on 401.

**Claude Desktop / Cursor / VS Code:**
```json
{
  "mcpServers": {
    "paperid": {
      "command": "node",
      "args": ["/absolute/path/to/paper-invoice-mcp/dist/index.js"],
      "env": {
        "PAPERID_PHONE":    "08xxxxxxxxxx",
        "PAPERID_PASSWORD": "your_password_here"
      }
    }
  }
}
```

**First run** — call `paperid_login` (or `paperid_refresh_token`) once to store the JWT in SQLite.  
After that, the server handles everything automatically.

> Token persisted at `~/.paperid-mcp/tokens.db`. Override path with `PAPERID_DB_PATH`.

---

## Features

- **Partner management** — create, read, list, search, update, delete
- **Invoice management** — create, read, list, send (WA/email/SMS), generate QRIS, delete
- **Notes & Terms** — `notes` (Keterangan) and `terms` (Syarat & Ketentuan) support plain text or HTML
- **Token persistence** — JWT stored in SQLite (`~/.paperid-mcp/tokens.db`)
- **Auto token refresh** — re-logins on 401 when `PAPERID_PHONE` + `PAPERID_PASSWORD` are set
- **Reporting** — account receivable/payable insights, profit & loss

---

## Requirements

- Node.js ≥ 18 (uses built-in `FormData`)
- [Bun](https://bun.sh) (recommended) or npm

---

## Installation

```bash
git clone git@github.com:igun997/paper-invoice-mcp.git
cd paper-invoice-mcp
bun install
bun run build
```

---

## Configuration

Create a `.env` file (or set environment variables):

```env
# Required for auto token refresh
PAPERID_PHONE=08xxxxxxxxxx
PAPERID_PASSWORD=your_password_here

# Optional overrides (loaded from SQLite if omitted)
PAPERID_TOKEN=            # JWT token (leave blank to use SQLite)
PAPERID_COMPANY_ID=       # Company UUID
PAPERID_USER_ID=          # User UUID

# Optional: custom SQLite path (default: ~/.paperid-mcp/tokens.db)
PAPERID_DB_PATH=/path/to/tokens.db
```

> **Security**: Never commit `.env` to version control. The `.gitignore` excludes it.

---

## Token Lifecycle

```
First run: PAPERID_PHONE + PAPERID_PASSWORD set
    → paperid_login  (or paperid_refresh_token tool)
    → JWT saved to SQLite

Subsequent runs:
    → JWT loaded from SQLite automatically
    → On 401: re-login silently, retry request

Manual refresh:
    → Call paperid_refresh_token tool
    → Or: set PAPERID_TOKEN env var for one-time use
```

---

## MCP Client Configuration

### Claude Desktop (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "paperid": {
      "command": "node",
      "args": ["/absolute/path/to/paper-invoice-mcp/dist/index.js"],
      "env": {
        "PAPERID_PHONE": "08xxxxxxxxxx",
        "PAPERID_PASSWORD": "your_password_here"
      }
    }
  }
}
```

### Cursor / VS Code (`.cursor/mcp.json` or `.vscode/mcp.json`)

```json
{
  "mcpServers": {
    "paperid": {
      "command": "node",
      "args": ["/absolute/path/to/paper-invoice-mcp/dist/index.js"],
      "env": {
        "PAPERID_PHONE": "08xxxxxxxxxx",
        "PAPERID_PASSWORD": "your_password_here"
      }
    }
  }
}
```

### Using Bun directly

```json
{
  "mcpServers": {
    "paperid": {
      "command": "bun",
      "args": ["run", "/absolute/path/to/paper-invoice-mcp/src/index.ts"],
      "env": {
        "PAPERID_PHONE": "08xxxxxxxxxx",
        "PAPERID_PASSWORD": "your_password_here"
      }
    }
  }
}
```

---

## Available Tools (31 total)

### Auth & Token
| Tool | Description |
|---|---|
| `paperid_login` | Login with phone + password |
| `paperid_refresh_token` | Re-login and update SQLite token |
| `paperid_get_token_info` | Check token expiry (does **not** expose raw JWT) |
| `paperid_get_current_user` | Get authenticated user info |

### Partners
| Tool | Description |
|---|---|
| `paperid_get_partners` | List partners with pagination |
| `paperid_search_partners` | Search partners by name |
| `paperid_get_partner` | Get partner by UUID |
| `paperid_create_partner` | Create new partner |
| `paperid_update_partner` | Update existing partner |
| `paperid_delete_partner` | Delete partner |
| `paperid_get_partner_contacts` | Get partner contacts |
| `paperid_get_partner_bank_accounts` | Get partner bank accounts |
| `paperid_get_next_partner_number` | Get next auto-generated partner number |

### Invoices
| Tool | Description |
|---|---|
| `paperid_get_sales_invoices` | List invoices with filters + pagination |
| `paperid_create_invoice` | Create invoice (supports notes + terms) |
| `paperid_get_invoice` | Get invoice by UUID |
| `paperid_get_invoice_pdf` | Get invoice PDF data |
| `paperid_send_invoice` | Send via WhatsApp / Email / SMS |
| `paperid_generate_invoice_qris` | Generate QRIS payment QR code |
| `paperid_delete_invoice` | Delete invoice |

### Reporting
| Tool | Description |
|---|---|
| `paperid_get_account_receivable` | AR insight (unpaid, overdue) |
| `paperid_get_account_payable` | AP insight |
| `paperid_get_profit_loss` | Profit & Loss report |
| `paperid_get_company` | Company details |
| `paperid_get_kyc_status` | KYC verification status |
| `paperid_get_user_package` | Subscription package info |
| `paperid_get_onboarding_status` | Onboarding completion |
| `paperid_get_referral_link` | Referral code & link |
| `paperid_get_notifications` | User notifications |
| `paperid_get_dashboard_todos` | Dashboard to-do list |
| `paperid_get_banners` | Promotional banners |

---

## Usage Examples

### Create Invoice with Notes & Terms

```json
{
  "tool": "paperid_create_invoice",
  "arguments": {
    "partner_id": "uuid-of-partner",
    "partner_name": "PT Mitra Sejati",
    "number": "INV/2026/0012",
    "invoice_date": "2026-05-14",
    "due_date": "2026-06-13",
    "items": [
      {
        "item_name": "Jasa Konsultasi",
        "item_description": "Konsultasi IT bulan Mei 2026",
        "quantity": 1,
        "price": 5000000
      }
    ],
    "notes": "Transfer ke BCA 1234567890 a/n PT Cipta Dua Saudara",
    "terms": "Pembayaran jatuh tempo 30 hari. Keterlambatan dikenakan denda 2%/bulan.",
    "status": 4
  }
}
```

`notes` and `terms` accept plain text (auto-wrapped in `<p>` tags) or raw HTML.

### Send Invoice via WhatsApp

```json
{
  "tool": "paperid_send_invoice",
  "arguments": {
    "invoiceId": "uuid-of-invoice",
    "whatsapp": { "number": "6281234567890" }
  }
}
```

### Refresh Token

```json
{
  "tool": "paperid_refresh_token",
  "arguments": {}
}
```

Returns expiry info. Raw JWT is **never** returned by any tool.

---

## MCP Resources

The server exposes 6 resources AI clients can read for accurate tool usage:

| URI | Description |
|---|---|
| `paperid://docs/overview` | Overview, tool groups, typical workflow |
| `paperid://docs/auth` | Login flow, SQLite persistence, auto-refresh |
| `paperid://docs/jwt-only` | JWT-only setup, config examples, expiry handling |
| `paperid://docs/partners` | Partner schema, field types, phone format, base paths |
| `paperid://docs/invoices` | Invoice schema, line items, notes/terms, status codes |
| `paperid://docs/api-reference` | All 31 HTTP endpoints with methods and paths |

---

## Project Structure

```
paper-invoice-mcp/
├── src/
│   ├── index.ts              # Entrypoint — connects MCP server to stdio
│   ├── server-factory.ts     # createMcpServer() — all tools, handlers, resources
│   ├── client.ts             # Paper.id API client (axios)
│   └── token-store.ts        # SQLite token persistence (better-sqlite3)
├── examples/
│   └── jwt-only.md           # JWT-only setup guide (step-by-step + all client configs)
├── .github/
│   └── workflows/ci.yml      # CI: build+resources (all PRs), e2e (merge to master)
├── dist/                     # Compiled JS (gitignored)
├── .env.example              # Sample env vars (no real credentials)
├── tsconfig.json
└── package.json
```

---

## Development

```bash
bun run build     # Compile TypeScript → dist/
bun run dev       # Run with tsx (no compile step)
```

---

## SQLite Schema

```sql
CREATE TABLE tokens (
  phone       TEXT PRIMARY KEY,
  token       TEXT NOT NULL,
  user_id     TEXT NOT NULL,
  company_id  TEXT NOT NULL,
  expires_at  INTEGER NOT NULL,  -- Unix timestamp
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
```

Token auto-refreshes when expired (with 5-minute buffer) if credentials are in env.

---

## License

MIT
