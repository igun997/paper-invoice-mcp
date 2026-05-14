#!/usr/bin/env node
/**
 * MCP Resources + Tools smoke test.
 * Boots an in-process MCP server (no network calls), verifies:
 *  - ListResources returns all 6 expected URIs
 *  - ReadResource returns valid Markdown for each URI
 *  - ListTools returns all 31 expected tools
 *  - Tool inputSchemas have required fields where expected
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import {
  ListResourcesResultSchema,
  ReadResourceResultSchema,
  ListToolsResultSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { createMcpServer } from './server-factory.js';

let passed = 0;
let failed = 0;

function ok(label: string, detail?: any) {
  passed++;
  process.stdout.write(`  ✓ ${label}${detail !== undefined ? ': ' + detail : ''}\n`);
}

function fail(label: string, detail?: any) {
  failed++;
  process.stderr.write(`  ✗ ${label}${detail !== undefined ? ': ' + detail : ''}\n`);
}

function assert(condition: boolean, label: string, detail?: any) {
  condition ? ok(label, detail) : fail(label, detail ?? 'assertion failed');
}

// ─── Spin up in-process server + client ──────────────────────────────────────

async function createPair() {
  const server = createMcpServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: 'test-client', version: '0.0.1' }, { capabilities: {} });
  await client.connect(clientTransport);
  return { client, server };
}

// ─── Expected definitions ────────────────────────────────────────────────────

const EXPECTED_RESOURCE_URIS = [
  'paperid://docs/overview',
  'paperid://docs/auth',
  'paperid://docs/jwt-only',
  'paperid://docs/partners',
  'paperid://docs/invoices',
  'paperid://docs/api-reference',
];

const EXPECTED_TOOLS = [
  'paperid_refresh_token',
  'paperid_get_token_info',
  'paperid_login',
  'paperid_get_current_user',
  'paperid_get_company',
  'paperid_get_sales_invoices',
  'paperid_get_partners',
  'paperid_get_account_receivable',
  'paperid_get_account_payable',
  'paperid_get_profit_loss',
  'paperid_get_kyc_status',
  'paperid_get_user_package',
  'paperid_get_onboarding_status',
  'paperid_get_referral_link',
  'paperid_get_notifications',
  'paperid_get_dashboard_todos',
  'paperid_get_banners',
  'paperid_get_partner',
  'paperid_create_partner',
  'paperid_update_partner',
  'paperid_delete_partner',
  'paperid_get_partner_contacts',
  'paperid_get_partner_bank_accounts',
  'paperid_get_next_partner_number',
  'paperid_search_partners',
  'paperid_create_invoice',
  'paperid_update_invoice',
  'paperid_publish_invoice',
  'paperid_get_invoice',
  'paperid_get_invoice_pdf',
  'paperid_send_invoice',
  'paperid_generate_invoice_qris',
  'paperid_delete_invoice',
  // payment tools
  'paperid_get_payment_number',
  'paperid_get_finance_accounts',
  'paperid_get_payment_methods',
  'paperid_create_payment',
  'paperid_get_payments',
  'paperid_get_payment_pdf',
  'paperid_send_payment',
  'paperid_delete_payment',
  // PaperPay In
  'paperid_get_paperpay_balance',
  'paperid_get_digital_payment_transactions',
  // product tools
  'paperid_get_products',
  'paperid_get_product',
  'paperid_get_next_product_sku',
  'paperid_create_product',
  'paperid_update_product',
  'paperid_delete_product',
  'paperid_get_product_categories',
  'paperid_get_product_category',
  'paperid_create_product_category',
  'paperid_update_product_category',
  'paperid_delete_product_category',
  'paperid_get_units_of_measure',
  'paperid_create_unit_of_measure',
  'paperid_update_unit_of_measure',
  'paperid_delete_unit_of_measure',
  'paperid_get_uom_categories',
  'paperid_get_uom_category',
  'paperid_create_uom_category',
  'paperid_update_uom_category',
  'paperid_delete_uom_category',
];

// ─── Tests ───────────────────────────────────────────────────────────────────

async function testResources(client: Client) {
  console.log('\n── Resources ─────────────────────────────────────────────────');

  const result = await client.request({ method: 'resources/list' }, ListResourcesResultSchema) as any;
  const uris = result.resources.map((r: any) => r.uri);

  assert(uris.length === EXPECTED_RESOURCE_URIS.length,
    `resource count = ${EXPECTED_RESOURCE_URIS.length}`, uris.length);

  for (const expected of EXPECTED_RESOURCE_URIS) {
    assert(uris.includes(expected), `resource registered: ${expected}`);
  }

  // Read each resource and validate content
  console.log('\n── Resource content ──────────────────────────────────────────');
  for (const uri of EXPECTED_RESOURCE_URIS) {
    const read = await client.request(
      { method: 'resources/read', params: { uri } },
      ReadResourceResultSchema
    ) as any;
    const content = read.contents[0];
    assert(content?.mimeType === 'text/markdown', `${uri} mimeType=text/markdown`);
    assert(typeof content?.text === 'string' && (content.text as string).length > 100,
      `${uri} has content`, `${(content?.text as string)?.length ?? 0} chars`);

    // Spot-check key phrases per resource
    const text: string = content?.text ?? '';
    if (uri === 'paperid://docs/overview') {
      assert(text.includes('paperid_create_invoice'), `overview mentions create_invoice`);
      assert(text.includes('paperid_search_partners'), `overview mentions search_partners`);
    }
    if (uri === 'paperid://docs/partners') {
      assert(text.includes('6281234567'), `partners doc includes phone format example`);
      assert(text.includes('/earth/'), `partners doc mentions /earth/ base path`);
    }
    if (uri === 'paperid://docs/invoices') {
      assert(text.includes('multipart'), `invoices doc mentions multipart`);
      assert(text.includes('notes'), `invoices doc mentions notes field`);
      assert(text.includes('terms'), `invoices doc mentions terms field`);
      assert(text.includes('0-100'), `invoices doc mentions discount 0-100`);
    }
    if (uri === 'paperid://docs/jwt-only') {
      assert(text.includes('PAPERID_TOKEN'), `jwt-only doc mentions PAPERID_TOKEN`);
      assert(text.includes('PAPERID_COMPANY_ID'), `jwt-only doc mentions PAPERID_COMPANY_ID`);
    }
    if (uri === 'paperid://docs/api-reference') {
      assert(text.includes('/api/v1/earth/partners'), `api-ref includes earth partners path`);
      assert(text.includes('sales-invoices-v2'), `api-ref includes v2 invoice path`);
    }
    if (uri === 'paperid://docs/auth') {
      assert(text.includes('SQLite'), `auth doc mentions SQLite`);
      assert(text.includes('401'), `auth doc mentions 401 auto-refresh`);
    }
  }
}

async function testTools(client: Client) {
  console.log('\n── Tools ─────────────────────────────────────────────────────');

  const result = await client.request({ method: 'tools/list' }, ListToolsResultSchema) as any;
  const names = result.tools.map((t: any) => t.name);

  assert(names.length === EXPECTED_TOOLS.length,
    `tool count = ${EXPECTED_TOOLS.length}`, names.length);

  for (const expected of EXPECTED_TOOLS) {
    assert(names.includes(expected), `tool registered: ${expected}`);
  }

  // Schema spot-checks
  const byName = Object.fromEntries(result.tools.map((t: any) => [t.name, t]));

  const createPartner = byName['paperid_create_partner'];
  assert(
    createPartner?.inputSchema?.required?.includes('number') &&
    createPartner?.inputSchema?.required?.includes('name') &&
    createPartner?.inputSchema?.required?.includes('phone'),
    'create_partner requires number, name, phone'
  );

  const createInvoice = byName['paperid_create_invoice'];
  assert(
    createInvoice?.inputSchema?.required?.includes('partner_id') &&
    createInvoice?.inputSchema?.required?.includes('items'),
    'create_invoice requires partner_id, items'
  );

  const sendInvoice = byName['paperid_send_invoice'];
  assert(
    sendInvoice?.inputSchema?.required?.includes('invoiceId'),
    'send_invoice requires invoiceId'
  );

  // discount description should mention percentage
  const discountDesc = createInvoice?.inputSchema?.properties?.items?.items
    ?.properties?.discount?.description ?? '';
  assert(
    discountDesc.toLowerCase().includes('percent') || discountDesc.includes('0-100'),
    'invoice item discount describes percentage'
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Paper.id MCP — Resources & Tools Test');
  console.log('════════════════════════════════════════════════════════');

  let client: Client | undefined;

  try {
    const pair = await createPair();
    client = pair.client;
    await testResources(client);
    await testTools(client);
  } catch (e: any) {
    fail('test setup failed', e.message);
  } finally {
    await client?.close().catch(() => {});
  }

  console.log('\n════════════════════════════════════════════════════════');
  console.log(`Result: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
