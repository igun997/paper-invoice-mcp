#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
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
