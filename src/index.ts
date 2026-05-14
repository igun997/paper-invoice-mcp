#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  Tool,
  Resource,
} from '@modelcontextprotocol/sdk/types.js';
import { PaperIdClient } from './client.js';

const server = new Server(
  {
    name: 'paperid-mcp',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

// Initialize client
const client = new PaperIdClient({
  phone: process.env.PAPERID_PHONE,
  password: process.env.PAPERID_PASSWORD,
  token: process.env.PAPERID_TOKEN,
  companyId: process.env.PAPERID_COMPANY_ID,
  userId: process.env.PAPERID_USER_ID,
});

// Define tools
const tools: Tool[] = [
  {
    name: 'paperid_refresh_token',
    description: 'Re-login and refresh the JWT token stored in SQLite. Uses PAPERID_PHONE + PAPERID_PASSWORD from env, or pass credentials directly.',
    inputSchema: {
      type: 'object',
      properties: {
        phone: { type: 'string', description: 'Phone number (optional, uses env PAPERID_PHONE)' },
        password: { type: 'string', description: 'Password (optional, uses env PAPERID_PASSWORD)' },
      },
    },
  },
  {
    name: 'paperid_get_token_info',
    description: 'Get current token metadata from SQLite (expiry, user_id, company_id). Does not expose the raw token.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'paperid_login',
    description: 'Login to Paper.id with phone and password',
    inputSchema: {
      type: 'object',
      properties: {
        phone: {
          type: 'string',
          description: 'Phone number (e.g., 08812345678)',
        },
        password: {
          type: 'string',
          description: 'Account password',
        },
        ipAddress: {
          type: 'string',
          description: 'IP address (optional, defaults to 0.0.0.0)',
        },
      },
      required: ['phone', 'password'],
    },
  },
  {
    name: 'paperid_get_current_user',
    description: 'Get current authenticated user information',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'paperid_get_company',
    description: 'Get company details',
    inputSchema: {
      type: 'object',
      properties: {
        companyId: {
          type: 'string',
          description: 'Company UUID (optional, uses authenticated company)',
        },
      },
    },
  },
  {
    name: 'paperid_get_sales_invoices',
    description: 'Get sales invoices with filters and pagination',
    inputSchema: {
      type: 'object',
      properties: {
        filters: {
          type: 'object',
          description: 'Filter criteria (number, client_name, status, dates, etc.)',
        },
        first: {
          type: 'number',
          description: 'Starting index (default: 0)',
        },
        rows: {
          type: 'number',
          description: 'Number of rows (default: 10)',
        },
      },
    },
  },
  {
    name: 'paperid_get_partners',
    description: 'Get partners/clients list',
    inputSchema: {
      type: 'object',
      properties: {
        filters: {
          type: 'object',
          description: 'Filter criteria',
        },
        first: {
          type: 'number',
          description: 'Starting index (default: 0)',
        },
        rows: {
          type: 'number',
          description: 'Number of rows (default: 10)',
        },
      },
    },
  },
  {
    name: 'paperid_get_account_receivable',
    description: 'Get account receivable insights (unpaid, partially paid, overdue)',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'paperid_get_account_payable',
    description: 'Get account payable insights',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'paperid_get_profit_loss',
    description: 'Get profit and loss report',
    inputSchema: {
      type: 'object',
      properties: {
        filters: {
          type: 'object',
          description: 'Filter criteria (date range, etc.)',
        },
      },
    },
  },
  {
    name: 'paperid_get_kyc_status',
    description: 'Get KYC verification status',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'paperid_get_user_package',
    description: 'Get user subscription package info',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'paperid_get_onboarding_status',
    description: 'Get company onboarding completion status',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'paperid_get_referral_link',
    description: 'Get user referral code and link',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'paperid_get_notifications',
    description: 'Get user notifications',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'paperid_get_dashboard_todos',
    description: 'Get dashboard to-do list',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'paperid_get_banners',
    description: 'Get promotional banners',
    inputSchema: {
      type: 'object',
      properties: {
        platform: {
          type: 'string',
          description: 'Platform (default: web)',
        },
      },
    },
  },
  {
    name: 'paperid_get_partner',
    description: 'Get a single partner by UUID',
    inputSchema: {
      type: 'object',
      properties: {
        partnerId: { type: 'string', description: 'Partner UUID' },
      },
      required: ['partnerId'],
    },
  },
  {
    name: 'paperid_create_partner',
    description: 'Create a new partner/client/supplier',
    inputSchema: {
      type: 'object',
      properties: {
        number: { type: 'string', description: 'Partner number (e.g. 0063)' },
        name: { type: 'string', description: 'Partner name' },
        phone: { type: 'string', description: 'Phone number with country code (e.g. 6281234567890)' },
        phone_country_code: { type: 'string', description: 'Phone country code (default: ID)' },
        email: { type: 'string', description: 'Email address' },
        type: { type: 'string', enum: ['Client', 'Supplier', 'Both'], description: 'Partner type (default: Both)' },
        address1: { type: 'string' },
        address2: { type: 'string' },
        city: { type: 'string' },
        state: { type: 'string' },
        postal_code: { type: 'string' },
        country: { type: 'string' },
        website: { type: 'string' },
        notes: { type: 'string' },
        account_receivable_id: { type: 'string', description: 'Account receivable GL ID' },
        account_payable_id: { type: 'string', description: 'Account payable GL ID' },
      },
      required: ['number', 'name', 'phone'],
    },
  },
  {
    name: 'paperid_update_partner',
    description: 'Update an existing partner',
    inputSchema: {
      type: 'object',
      properties: {
        partnerId: { type: 'string', description: 'Partner UUID' },
        number: { type: 'string' },
        name: { type: 'string' },
        phone: { type: 'string' },
        phone_country_code: { type: 'string' },
        email: { type: 'string' },
        type: { type: 'string', enum: ['Client', 'Supplier', 'Both'] },
        address1: { type: 'string' },
        address2: { type: 'string' },
        city: { type: 'string' },
        state: { type: 'string' },
        postal_code: { type: 'string' },
        country: { type: 'string' },
        website: { type: 'string' },
        notes: { type: 'string' },
      },
      required: ['partnerId'],
    },
  },
  {
    name: 'paperid_delete_partner',
    description: 'Delete a partner by UUID',
    inputSchema: {
      type: 'object',
      properties: {
        partnerId: { type: 'string', description: 'Partner UUID' },
      },
      required: ['partnerId'],
    },
  },
  {
    name: 'paperid_get_partner_contacts',
    description: 'Get contacts for a partner',
    inputSchema: {
      type: 'object',
      properties: {
        partnerId: { type: 'string', description: 'Partner UUID' },
      },
      required: ['partnerId'],
    },
  },
  {
    name: 'paperid_get_partner_bank_accounts',
    description: 'Get bank accounts for a partner',
    inputSchema: {
      type: 'object',
      properties: {
        partnerId: { type: 'string', description: 'Partner UUID' },
      },
      required: ['partnerId'],
    },
  },
  {
    name: 'paperid_get_next_partner_number',
    description: 'Get next auto-generated partner number',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'paperid_search_partners',
    description: 'Search partners by name (uses earth API, used in invoice form dropdowns)',
    inputSchema: {
      type: 'object',
      properties: {
        nameFilter: { type: 'string', description: 'Name substring to search' },
        first: { type: 'number', description: 'Starting index (default: 0)' },
        rows: { type: 'number', description: 'Rows (default: 50)' },
        type: { type: 'string', description: 'Partner type filter (Client/Supplier/Both)' },
      },
    },
  },
  {
    name: 'paperid_create_invoice',
    description: 'Create a new sales invoice (multipart/form-data)',
    inputSchema: {
      type: 'object',
      properties: {
        partner_id: { type: 'string', description: 'Partner UUID' },
        partner_name: { type: 'string', description: 'Partner name (display)' },
        number: { type: 'string', description: 'Invoice number e.g. INV/2026/0011' },
        invoice_date: { type: 'string', description: 'Invoice date YYYY-MM-DD' },
        due_date: { type: 'string', description: 'Due date YYYY-MM-DD' },
        items: {
          type: 'array',
          description: 'Line items',
          items: {
            type: 'object',
            properties: {
              item_name: { type: 'string' },
              item_description: { type: 'string' },
              quantity: { type: 'number' },
              price: { type: 'number' },
              discount: { type: 'number' },
              tax_id: { type: 'string' },
            },
            required: ['item_name', 'quantity', 'price'],
          },
        },
        notes: { type: 'string', description: 'Keterangan (plain text or HTML)' },
        terms: { type: 'string', description: 'Syarat & Ketentuan (plain text or HTML)' },
        currency: { type: 'string', description: 'Currency symbol default Rp' },
        discount: { type: 'number', description: 'Overall discount amount' },
        delivery_fee: { type: 'number' },
        status: { type: 'number', description: '4=draft, 0=normal' },
        signature_text_header: { type: 'string' },
        signature_text_footer: { type: 'string' },
      },
      required: ['partner_id', 'partner_name', 'number', 'invoice_date', 'due_date', 'items'],
    },
  },
  {
    name: 'paperid_get_invoice',
    description: 'Get a single sales invoice by UUID',
    inputSchema: {
      type: 'object',
      properties: {
        invoiceId: { type: 'string', description: 'Invoice UUID' },
      },
      required: ['invoiceId'],
    },
  },
  {
    name: 'paperid_get_invoice_pdf',
    description: 'Get PDF data for a sales invoice',
    inputSchema: {
      type: 'object',
      properties: {
        invoiceId: { type: 'string', description: 'Invoice UUID' },
      },
      required: ['invoiceId'],
    },
  },
  {
    name: 'paperid_send_invoice',
    description: 'Send invoice via WhatsApp, Email, and/or SMS',
    inputSchema: {
      type: 'object',
      properties: {
        invoiceId: { type: 'string', description: 'Invoice UUID' },
        whatsapp: {
          type: 'object',
          description: 'WhatsApp recipient',
          properties: { number: { type: 'string', description: 'Phone with country code, e.g. 6281234567890' } },
        },
        email: {
          type: 'object',
          description: 'Email recipient',
          properties: {
            to: { type: 'string' },
            cc: { type: 'string' },
          },
        },
        sms: {
          type: 'object',
          description: 'SMS recipient',
          properties: { number: { type: 'string' } },
        },
      },
      required: ['invoiceId'],
    },
  },
  {
    name: 'paperid_generate_invoice_qris',
    description: 'Generate QRIS (QR code) payment for an invoice',
    inputSchema: {
      type: 'object',
      properties: {
        invoiceId: { type: 'string', description: 'Invoice UUID' },
      },
      required: ['invoiceId'],
    },
  },
  {
    name: 'paperid_delete_invoice',
    description: 'Delete a sales invoice by UUID',
    inputSchema: {
      type: 'object',
      properties: {
        invoiceId: { type: 'string', description: 'Invoice UUID' },
      },
      required: ['invoiceId'],
    },
  },
];

// ─── Resources ─────────────────────────────────────────────────────────────

const RESOURCES: Resource[] = [
  {
    uri: 'paperid://docs/overview',
    name: 'Paper.id MCP — Overview & Quick Start',
    description: 'What this MCP does, when to use each tool group, auth flow',
    mimeType: 'text/markdown',
  },
  {
    uri: 'paperid://docs/auth',
    name: 'Authentication & Token Management',
    description: 'Login flow, JWT persistence in SQLite, auto-refresh on 401, token tools',
    mimeType: 'text/markdown',
  },
  {
    uri: 'paperid://docs/partners',
    name: 'Partner Tools — Schema & Examples',
    description: 'Full field reference for create/update partner, type enum, phone format',
    mimeType: 'text/markdown',
  },
  {
    uri: 'paperid://docs/invoices',
    name: 'Invoice Tools — Schema & Examples',
    description: 'Create invoice payload, line items, notes/terms, status codes, send options',
    mimeType: 'text/markdown',
  },
  {
    uri: 'paperid://docs/api-reference',
    name: 'API Endpoint Reference',
    description: 'Raw HTTP endpoints, methods, base paths, headers for all 31 tools',
    mimeType: 'text/markdown',
  },
  {
    uri: 'paperid://docs/jwt-only',
    name: 'JWT-Only Setup (no phone/password)',
    description: 'How to use with a pre-captured JWT token: config examples for Claude Desktop, Cursor, Bun; how to find company_id and user_id; token expiry handling',
    mimeType: 'text/markdown',
  },
];

const RESOURCE_CONTENT: Record<string, string> = {
  'paperid://docs/overview': `# Paper.id MCP — Overview

## What is this?
MCP server for [Paper.id](https://paper.id) — Indonesian invoicing platform.
Exposes **31 tools** so AI assistants can manage invoices, partners, and reports.

## Tool Groups

| Group | Tools | Use when |
|---|---|---|
| **Auth** | login, refresh_token, get_token_info, get_current_user | First setup, token expired |
| **Partners** | get_partners, search_partners, get_partner, create_partner, update_partner, delete_partner, get_partner_contacts, get_partner_bank_accounts, get_next_partner_number | Managing clients/suppliers |
| **Invoices** | get_sales_invoices, create_invoice, get_invoice, get_invoice_pdf, send_invoice, generate_invoice_qris, delete_invoice | Invoice lifecycle |
| **Reporting** | get_account_receivable, get_account_payable, get_profit_loss, get_company, get_kyc_status, get_user_package, get_onboarding_status, get_referral_link, get_notifications, get_dashboard_todos, get_banners | Dashboard data |

## Typical Workflow

\`\`\`
1. paperid_get_token_info          → check if token valid
   (if expired) paperid_refresh_token
2. paperid_search_partners          → find partner UUID by name
3. paperid_get_sales_invoices       → list existing invoices
4. paperid_create_invoice           → create new invoice
5. paperid_send_invoice             → send via WhatsApp
6. paperid_generate_invoice_qris    → get QR payment code
\`\`\`

## Base URL
\`https://api.paper.id\`

## Required Headers (handled automatically)
- \`Authorization: Bearer {jwt}\`
- \`Content-Type: application/json\`  (or \`multipart/form-data\` for create_invoice)
- \`x-paper-user-agent: Jupiter/7.15.16 desktop (linux) Chrome 146\`
- \`request-id: {unique-48-char-string}\`
`,

  'paperid://docs/auth': `# Authentication & Token Management

## Login Flow

\`\`\`
call paperid_login(phone, password)
  → JWT saved to ~/.paperid-mcp/tokens.db (SQLite)
  → in-memory token set
  → subsequent calls use this token automatically
\`\`\`

## Token Persistence (SQLite)
- Path: \`~/.paperid-mcp/tokens.db\` (override with \`PAPERID_DB_PATH\`)
- Survives server restarts — token loaded on startup
- Keyed by phone number

## Auto-Refresh on 401
If \`PAPERID_PHONE\` + \`PAPERID_PASSWORD\` are set in env:
- 401 response triggers silent re-login
- Original request retried automatically
- No user action needed

## Tools

### paperid_login
\`\`\`json
{ "phone": "08812345678", "password": "yourpassword" }
\`\`\`
Returns: raw login response (includes company list). Token saved to SQLite.

### paperid_refresh_token
\`\`\`json
{}   // uses PAPERID_PHONE + PAPERID_PASSWORD from env
// or:
{ "phone": "08812345678", "password": "yourpassword" }
\`\`\`
Returns: \`{ user_id, company_id, expires_at, expires_at_human }\`  
**Raw JWT is never returned by any tool.**

### paperid_get_token_info
\`\`\`json
{}
\`\`\`
Returns:
\`\`\`json
{
  "phone": "08812345678",
  "user_id": "uuid",
  "company_id": "uuid",
  "expires_at": 1778830204,
  "expires_at_human": "2026-05-15T14:30:04.000Z",
  "is_expired": false,
  "updated_at_human": "2026-05-14T10:00:00.000Z"
}
\`\`\`

## SQLite Schema
\`\`\`sql
CREATE TABLE tokens (
  phone       TEXT PRIMARY KEY,
  token       TEXT NOT NULL,
  user_id     TEXT NOT NULL,
  company_id  TEXT NOT NULL,
  expires_at  INTEGER NOT NULL,  -- Unix timestamp (seconds)
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
\`\`\`

## Environment Variables
| Variable | Required | Description |
|---|---|---|
| \`PAPERID_PHONE\` | For auto-refresh | Phone number |
| \`PAPERID_PASSWORD\` | For auto-refresh | Password |
| \`PAPERID_TOKEN\` | Optional | One-time JWT override |
| \`PAPERID_COMPANY_ID\` | Optional | Company UUID override |
| \`PAPERID_USER_ID\` | Optional | User UUID override |
| \`PAPERID_DB_PATH\` | Optional | SQLite path override |
`,

  'paperid://docs/partners': `# Partner Tools — Schema & Examples

## Partner Object Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| \`number\` | string | create | Auto-suggest via \`get_next_partner_number\` |
| \`name\` | string | create | Display name |
| \`phone\` | string | create | With country code: \`6281234567890\` |
| \`phone_country_code\` | string | — | Default: \`ID\` |
| \`email\` | string | — | |
| \`type\` | enum | — | \`Client\` \| \`Supplier\` \| \`Both\` (default: \`Both\`) |
| \`address1\` | string | — | |
| \`address2\` | string | — | |
| \`city\` | string | — | |
| \`state\` | string | — | |
| \`postal_code\` | string | — | |
| \`country\` | string | — | |
| \`website\` | string | — | |
| \`notes\` | string | — | Internal notes |
| \`account_receivable_id\` | string | — | GL account UUID |
| \`account_payable_id\` | string | — | GL account UUID |

## Create Partner
\`\`\`json
{
  "number": "0063",
  "name": "PT Mitra Sejati",
  "phone": "6281234567890",
  "email": "finance@mitrasejati.co.id",
  "type": "Client",
  "city": "Jakarta"
}
\`\`\`

## Update Partner
\`\`\`json
{
  "partnerId": "uuid-of-partner",
  "email": "newemail@example.com",
  "city": "Surabaya"
}
\`\`\`
Only fields provided are changed. \`partnerId\` required.

## Search vs List
- \`paperid_search_partners\` — fast name search (used for invoice dropdown), searches \`/earth\` API
- \`paperid_get_partners\` — full list with pagination, searches \`/invoicer\` API

## Phone Format
Always use international format without \`+\`: \`6281234567890\` (not \`+62...\` or \`081...\`)

## API Base Paths (important — mixed)
| Operation | Base path |
|---|---|
| Create | \`POST /api/v1/earth/partners\` |
| List | \`POST /api/v1/invoicer/partners/all\` |
| Get | \`GET /api/v1/invoicer/partners/{id}\` |
| Update | \`PUT /api/v1/invoicer/partners/{id}\` |
| Delete | \`DELETE /api/v1/earth/partners/{id}\` |
| Search | \`POST /api/v1/earth/partners/all\` |
| Next# | \`GET /api/v1/invoicer/partners/number\` |
`,

  'paperid://docs/invoices': `# Invoice Tools — Schema & Examples

## Create Invoice

### Required Fields
| Field | Type | Notes |
|---|---|---|
| \`partner_id\` | string | Partner UUID — use \`search_partners\` first |
| \`partner_name\` | string | Partner display name (denormalized) |
| \`number\` | string | e.g. \`INV/2026/0012\` — use \`get_next_invoice_number\` |
| \`invoice_date\` | string | \`YYYY-MM-DD\` |
| \`due_date\` | string | \`YYYY-MM-DD\` |
| \`items\` | array | At least 1 line item |

### Optional Fields
| Field | Type | Default | Notes |
|---|---|---|---|
| \`notes\` | string | \`\`\` | Keterangan — plain text or HTML |
| \`terms\` | string | \`\`\` | Syarat & Ketentuan — plain text or HTML |
| \`currency\` | string | \`Rp\` | |
| \`discount\` | number | \`0\` | Overall discount amount |
| \`delivery_fee\` | number | \`0\` | |
| \`status\` | number | \`4\` | \`4\`=draft, \`0\`=normal/published |
| \`signature_text_header\` | string | \`\`\` | |
| \`signature_text_footer\` | string | \`\`\` | |

### Line Item Fields
| Field | Type | Required | Notes |
|---|---|---|---|
| \`item_name\` | string | ✓ | Product/service name |
| \`quantity\` | number | ✓ | |
| \`price\` | number | ✓ | Unit price in IDR |
| \`item_description\` | string | — | |
| \`discount\` | number | — | Per-item discount |
| \`tax_id\` | string | — | Tax UUID |

## Full Example
\`\`\`json
{
  "partner_id": "uuid-of-partner",
  "partner_name": "PT Mitra Sejati",
  "number": "INV/2026/0012",
  "invoice_date": "2026-05-14",
  "due_date": "2026-06-13",
  "items": [
    {
      "item_name": "Jasa Konsultasi IT",
      "item_description": "Implementasi sistem ERP",
      "quantity": 1,
      "price": 5000000
    },
    {
      "item_name": "Lisensi Software",
      "quantity": 3,
      "price": 750000
    }
  ],
  "notes": "Mohon transfer ke BCA 1234567890 a/n PT Cipta Dua",
  "terms": "Pembayaran jatuh tempo 30 hari sejak tanggal invoice.",
  "status": 0
}
\`\`\`

## Notes & Terms HTML Conversion
Plain text auto-wrapped: \`"Hello\\nWorld"\` → \`<p>Hello</p><p>World</p>\`  
Pre-formed HTML passed through unchanged if starts with \`<\`.

## Invoice Status Codes
| Value | Meaning |
|---|---|
| \`0\` | Normal (published) |
| \`1\` | Paid |
| \`2\` | Partial paid |
| \`3\` | Overdue |
| \`4\` | Draft |
| \`5\` | Cancelled |

## Send Invoice
\`\`\`json
{
  "invoiceId": "uuid",
  "whatsapp": { "number": "6281234567890" }
}
\`\`\`
Can combine channels:
\`\`\`json
{
  "invoiceId": "uuid",
  "whatsapp": { "number": "6281234567890" },
  "email": { "to": "client@example.com", "cc": "finance@example.com" }
}
\`\`\`

## Generate QRIS
\`\`\`json
{ "invoiceId": "uuid" }
\`\`\`
Returns QR code data for QRIS payment.

## API Endpoints
| Operation | Method | Path |
|---|---|---|
| Create | POST | \`/api/v1/invoicer/sales-invoices\` (multipart/form-data) |
| List | POST | \`/api/v1/invoicer/sales-invoices/all\` |
| Get | GET | \`/api/v1/invoicer/sales-invoices-v2/{id}\` |
| PDF | GET | \`/api/v1/invoicer/sales-invoices/pdf/{id}\` |
| Send | POST | \`/api/v1/invoicer/sales-invoices/send-all/{id}\` |
| QRIS | POST | \`/api/v1/invoicer/sales-invoices/{id}/qris\` |
| Delete | DELETE | \`/api/v1/invoicer/sales-invoices/{id}\` |
`,

  'paperid://docs/jwt-only': `# JWT-Only Setup

Use when you have a JWT token but don't want to store phone/password.

> JWT from Paper.id expires (24h normal login, 30d remember-me).
> When expired, grab a new token from DevTools and update config.
> For auto-refresh, use PAPERID_PHONE + PAPERID_PASSWORD instead.

## How to Get JWT Token

1. Open app.paper.id in Chrome
2. DevTools → Network tab
3. Click any request to api.paper.id
4. Copy \`Authorization: Bearer eyJ...\` header value (strip \`Bearer \` prefix)

## MCP Config Examples

### Claude Desktop / Cursor / VS Code
\`\`\`json
{
  "mcpServers": {
    "paperid": {
      "command": "node",
      "args": ["/path/to/paper-invoice-mcp/dist/index.js"],
      "env": {
        "PAPERID_TOKEN": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.your.token",
        "PAPERID_COMPANY_ID": "your-company-uuid",
        "PAPERID_USER_ID": "your-user-uuid"
      }
    }
  }
}
\`\`\`

### Bun (no compile step)
\`\`\`json
{
  "mcpServers": {
    "paperid": {
      "command": "bun",
      "args": ["run", "/path/to/paper-invoice-mcp/src/index.ts"],
      "env": {
        "PAPERID_TOKEN": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.your.token",
        "PAPERID_COMPANY_ID": "your-company-uuid",
        "PAPERID_USER_ID": "your-user-uuid"
      }
    }
  }
}
\`\`\`

## Find company_id and user_id

Option A: DevTools — look in response body of any auth request for \`body.company.uuid\` and \`body.uuid\`
Option B: After setting PAPERID_TOKEN, call \`paperid_get_current_user\` tool — returns both IDs.

## Check Token Expiry

Tool: \`paperid_get_token_info\`
\`\`\`json
{
  "expires_at_human": "2026-06-13T14:30:04.000Z",
  "is_expired": false
}
\`\`\`

Raw JWT is **never returned** by any tool.

## JWT-only vs Phone+Password

| | JWT-only | Phone + Password |
|---|---|---|
| Auto-refresh | No — manual token update | Yes — automatic on 401 |
| Token persistence | In-memory only | SQLite (~/.paperid-mcp/tokens.db) |
| Best for | Quick testing, CI with short-lived tokens | Long-running assistants |
`,

  'paperid://docs/api-reference': `# Paper.id API Endpoint Reference

Base URL: \`https://api.paper.id\`

## Auth
| Method | Path | Tool |
|---|---|---|
| POST | \`/api/v1/auth/login/user\` | paperid_login |
| GET | \`/api/v1/milky-way/users/me\` | paperid_get_current_user |
| GET | \`/api/v1/users/{id}\` | (internal) |
| GET | \`/api/v1/companies/{id}\` | paperid_get_company |

## Partners
| Method | Path | Tool |
|---|---|---|
| POST | \`/api/v1/earth/partners\` | paperid_create_partner |
| POST | \`/api/v1/invoicer/partners/all\` | paperid_get_partners |
| GET | \`/api/v1/invoicer/partners/{id}\` | paperid_get_partner |
| PUT | \`/api/v1/invoicer/partners/{id}\` | paperid_update_partner |
| DELETE | \`/api/v1/earth/partners/{id}\` | paperid_delete_partner |
| POST | \`/api/v1/earth/partners/all\` | paperid_search_partners |
| GET | \`/api/v1/invoicer/partners/number\` | paperid_get_next_partner_number |
| GET | \`/api/v1/invoicer/partner/contacts/{id}\` | paperid_get_partner_contacts |
| GET | \`/api/v1/invoicer/bank-account/{id}?type=all\` | paperid_get_partner_bank_accounts |

## Invoices
| Method | Path | Tool |
|---|---|---|
| POST | \`/api/v1/invoicer/sales-invoices\` (multipart) | paperid_create_invoice |
| POST | \`/api/v1/invoicer/sales-invoices/all\` | paperid_get_sales_invoices |
| GET | \`/api/v1/invoicer/sales-invoices-v2/{id}\` | paperid_get_invoice |
| GET | \`/api/v1/invoicer/sales-invoices/pdf/{id}\` | paperid_get_invoice_pdf |
| POST | \`/api/v1/invoicer/sales-invoices/send-all/{id}\` | paperid_send_invoice |
| POST | \`/api/v1/invoicer/sales-invoices/{id}/qris\` | paperid_generate_invoice_qris |
| DELETE | \`/api/v1/invoicer/sales-invoices/{id}\` | paperid_delete_invoice |
| GET | \`/api/v1/invoicer/sales-invoices/number\` | (next number) |

## Reporting
| Method | Path | Tool |
|---|---|---|
| GET | \`/api/v1/reporting/account-receivable/insight\` | paperid_get_account_receivable |
| GET | \`/api/v1/reporting/account-payable/insight\` | paperid_get_account_payable |
| POST | \`/api/v1/reporting/dashboard/profit-and-loss\` | paperid_get_profit_loss |
| GET | \`/api/v1/paper-kyc/kyc\` | paperid_get_kyc_status |
| GET | \`/api/v1/users/package\` | paperid_get_user_package |
| GET | \`/api/v1/milky-way/companies/onboarding-status\` | paperid_get_onboarding_status |
| GET | \`/api/v1/referral-code/link\` | paperid_get_referral_link |
| POST | \`/api/v1/notification/notifications\` | paperid_get_notifications |
| GET | \`/api/v1/invoicer/dashboard/to-do-list\` | paperid_get_dashboard_todos |
| GET | \`/api/v1/reporting/banners\` | paperid_get_banners |

## Required Headers
\`\`\`
Authorization: Bearer {jwt}
Content-Type: application/json
x-paper-user-agent: Jupiter/7.15.16 desktop (linux) Chrome 146
request-id: {unique-48-char-alphanumeric}
\`\`\`

## Notes on Mixed Base Paths
- Partner **create** and **delete** use \`/earth\` prefix
- Partner **read/update** use \`/invoicer\` prefix
- Invoice **create** uses \`multipart/form-data\`, all others use JSON
- Invoice **get** uses \`sales-invoices-v2\` (v2!), list uses \`sales-invoices\`
`,
};

server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return { resources: RESOURCES };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;
  const content = RESOURCE_CONTENT[uri];
  if (!content) {
    throw new Error(`Resource not found: ${uri}`);
  }
  return {
    contents: [
      {
        uri,
        mimeType: 'text/markdown',
        text: content,
      },
    ],
  };
});

// ─── Tools ──────────────────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'paperid_refresh_token': {
        const { phone: rPhone, password: rPw } = args as { phone?: string; password?: string };
        const result = await client.relogin(rPhone, rPw);
        // Return safe summary, NOT the raw token
        const info = client.getTokenInfo();
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: !!result,
              user_id: info?.user_id,
              company_id: info?.company_id,
              expires_at: info?.expires_at,
              expires_at_human: info ? new Date(info.expires_at * 1000).toISOString() : null,
              updated_at: info?.updated_at,
            }, null, 2),
          }],
        };
      }

      case 'paperid_get_token_info': {
        const info = client.getTokenInfo();
        if (!info) return { content: [{ type: 'text', text: 'No token stored. Run paperid_refresh_token or paperid_login first.' }] };
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              phone: info.phone,
              user_id: info.user_id,
              company_id: info.company_id,
              expires_at: info.expires_at,
              expires_at_human: new Date(info.expires_at * 1000).toISOString(),
              is_expired: info.is_expired,
              updated_at_human: new Date(info.updated_at * 1000).toISOString(),
            }, null, 2),
          }],
        };
      }

      case 'paperid_login': {
        const { phone, password, ipAddress } = args as {
          phone: string;
          password: string;
          ipAddress?: string;
        };
        const result = await client.login(phone, password, ipAddress);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'paperid_get_current_user': {
        const result = await client.getCurrentUser();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'paperid_get_company': {
        const { companyId } = args as { companyId?: string };
        const result = await client.getCompany(companyId);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'paperid_get_sales_invoices': {
        const { filters, first, rows } = args as {
          filters?: any;
          first?: number;
          rows?: number;
        };
        const result = await client.getSalesInvoices(filters, first, rows);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'paperid_get_partners': {
        const { filters, first, rows } = args as {
          filters?: any;
          first?: number;
          rows?: number;
        };
        const result = await client.getPartners(filters, first, rows);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'paperid_get_account_receivable': {
        const result = await client.getAccountReceivableInsight();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'paperid_get_account_payable': {
        const result = await client.getAccountPayableInsight();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'paperid_get_profit_loss': {
        const { filters } = args as { filters?: any };
        const result = await client.getProfitAndLoss(filters);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'paperid_get_kyc_status': {
        const result = await client.getKycStatus();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'paperid_get_user_package': {
        const result = await client.getUserPackage();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'paperid_get_onboarding_status': {
        const result = await client.getOnboardingStatus();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'paperid_get_referral_link': {
        const result = await client.getReferralLink();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'paperid_get_notifications': {
        const result = await client.getNotifications();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'paperid_get_dashboard_todos': {
        const result = await client.getDashboardTodoList();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'paperid_get_banners': {
        const { platform } = args as { platform?: string };
        const result = await client.getBanners(platform);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'paperid_get_partner': {
        const { partnerId } = args as { partnerId: string };
        const result = await client.getPartnerById(partnerId);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'paperid_create_partner': {
        const result = await client.createPartner(args as any);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'paperid_update_partner': {
        const { partnerId, ...data } = args as { partnerId: string; [key: string]: any };
        const result = await client.updatePartner(partnerId, data);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'paperid_delete_partner': {
        const { partnerId } = args as { partnerId: string };
        const result = await client.deletePartner(partnerId);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'paperid_get_partner_contacts': {
        const { partnerId } = args as { partnerId: string };
        const result = await client.getPartnerContacts(partnerId);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'paperid_get_partner_bank_accounts': {
        const { partnerId } = args as { partnerId: string };
        const result = await client.getPartnerBankAccounts(partnerId);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'paperid_get_next_partner_number': {
        const result = await client.getPartnerNumber();
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'paperid_search_partners': {
        const { nameFilter, first, rows, type } = args as any;
        const result = await client.searchPartners(nameFilter, first, rows, type);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'paperid_create_invoice': {
        const result = await client.createInvoice(args as any);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'paperid_get_invoice': {
        const { invoiceId } = args as { invoiceId: string };
        const result = await client.getSalesInvoice(invoiceId);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'paperid_get_invoice_pdf': {
        const { invoiceId } = args as { invoiceId: string };
        const result = await client.getSalesInvoicePdf(invoiceId);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'paperid_send_invoice': {
        const { invoiceId, ...options } = args as { invoiceId: string; [key: string]: any };
        const result = await client.sendInvoice(invoiceId, options);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'paperid_generate_invoice_qris': {
        const { invoiceId } = args as { invoiceId: string };
        const result = await client.generateInvoiceQris(invoiceId);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'paperid_delete_invoice': {
        const { invoiceId } = args as { invoiceId: string };
        const result = await client.deleteInvoice(invoiceId);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error: any) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error.message}\n${error.response?.data ? JSON.stringify(error.response.data, null, 2) : ''}`,
        },
      ],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Paper.id MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
