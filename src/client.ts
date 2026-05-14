import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { TokenStore, StoredToken } from './token-store.js';

export interface PaperIdConfig {
  baseUrl?: string;
  phone?: string;
  password?: string;
  token?: string;
  companyId?: string;
  userId?: string;
  dbPath?: string;    // SQLite path for token persistence
  autoRefresh?: boolean; // Auto-refresh token before expiry (default: true)
}

export class PaperIdClient {
  private axios: AxiosInstance;
  private config: PaperIdConfig;
  private token?: string;
  private companyId?: string;
  private userId?: string;
  private phone?: string;
  private tokenStore: TokenStore;

  constructor(config: PaperIdConfig = {}) {
    this.config = {
      baseUrl: config.baseUrl || 'https://api.paper.id',
      autoRefresh: config.autoRefresh !== false,
      ...config,
    };

    this.phone = config.phone;
    this.tokenStore = new TokenStore(config.dbPath);

    // Bootstrap token: env var > SQLite > nothing
    if (config.token) {
      this.token = config.token;
      this.companyId = config.companyId;
      this.userId = config.userId;
    } else {
      // Try loading from SQLite (by phone or latest)
      const stored = config.phone
        ? this.tokenStore.load(config.phone)
        : this.tokenStore.loadLatest();
      if (stored && !this.tokenStore.isExpired(stored)) {
        this.token = stored.token;
        this.companyId = stored.company_id;
        this.userId = stored.user_id;
        this.phone = stored.phone;
      }
    }

    this.axios = axios.create({
      baseURL: this.config.baseUrl,
      headers: {
        'Content-Type': 'application/json',
        'x-paper-user-agent': 'Jupiter/7.15.16 desktop (linux) Chrome 146',
      },
    });

    // Auth + request-id interceptor
    this.axios.interceptors.request.use((config) => {
      if (this.token) {
        config.headers.Authorization = `Bearer ${this.token}`;
      }
      config.headers['request-id'] = this.generateRequestId();
      return config;
    });

    // Auto-refresh on 401
    this.axios.interceptors.response.use(
      (res) => res,
      async (err) => {
        if (
          err.response?.status === 401 &&
          this.config.autoRefresh &&
          this.config.phone &&
          this.config.password &&
          !err.config._retried
        ) {
          err.config._retried = true;
          await this.relogin(this.config.phone, this.config.password);
          err.config.headers.Authorization = `Bearer ${this.token}`;
          return this.axios.request(err.config);
        }
        return Promise.reject(err);
      }
    );
  }

  private generateRequestId(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    let id = '';
    for (let i = 0; i < 48; i++) {
      id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return id;
  }

  async checkAccount(phone: string) {
    const response = await this.axios.post('/api/v1/auth/login/user/check-account', {
      phone,
    });
    return response.data;
  }

  async login(phone: string, password: string, ipAddress: string = '0.0.0.0') {
    const response = await this.axios.post('/api/v1/auth/login/user', {
      phone,
      password,
      ttl: 86400,
      ip_address: ipAddress,
      fingerprint: '',
    });

    const data = response.data;
    if (data.body?.token) {
      this.token = data.body.token;
      this.userId = data.body.uuid;
      this.phone = phone;
      if (data.body.companies?.[0]) {
        this.companyId = data.body.companies[0].uuid;
      }
      // Persist to SQLite
      const expiresAt = this._jwtExpiry(data.body.token) ?? Math.floor(Date.now() / 1000) + 86400;
      this.tokenStore.save({
        phone,
        token: this.token!,
        user_id: this.userId!,
        company_id: this.companyId!,
        expires_at: expiresAt,
      });
    }

    return data;
  }

  /** Re-login silently — used by 401 interceptor and paperid_refresh_token tool */
  async relogin(phone?: string, password?: string) {
    const p = phone || this.config.phone;
    const pw = password || this.config.password;
    if (!p || !pw) throw new Error('Phone and password required for token refresh');
    return this.login(p, pw);
  }

  /** Returns current token metadata from SQLite */
  getTokenInfo(): (StoredToken & { is_expired: boolean }) | null {
    const stored = this.phone
      ? this.tokenStore.load(this.phone)
      : this.tokenStore.loadLatest();
    if (!stored) return null;
    return { ...stored, is_expired: this.tokenStore.isExpired(stored) };
  }

  /** Decode JWT expiry without verifying signature */
  private _jwtExpiry(token: string): number | null {
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
      return payload.exp ?? null;
    } catch {
      return null;
    }
  }

  async validateDevice(userId: string, fingerprint: string) {
    const response = await this.axios.post('/api/v1/auth/login/user/validate-device', {
      user_id: userId,
      fingerprint,
    });
    return response.data;
  }

  async sendOtp(token: string, method: 'whatsapp' | 'sms' | 'email', phone: string) {
    const response = await this.axios.post('/api/v1/auth/fingerprints/send-otp', {
      token,
      method,
      phone,
    });
    return response.data;
  }

  async verifyOtp(otp: string, recipient: string) {
    const response = await this.axios.post('/api/v1/auth/fingerprints/verify-otp', {
      otp,
      recipient,
    });
    return response.data;
  }

  async finalLogin(
    userId: string,
    companyId: string,
    token: string,
    ipAddress: string,
    fingerprintChallenge: string,
    fingerprintId: string,
    fingerprintRequestId: string,
    rememberMe: boolean = false
  ) {
    const response = await this.axios.post('/api/v1/auth/login-v2', {
      user_id: userId,
      company_id: companyId,
      token,
      ip_address: ipAddress,
      remember_me: rememberMe,
      fingerprint_challenge: fingerprintChallenge,
      ttl: rememberMe ? 2592000 : 86400, // 30 days or 1 day
      fingerprint_id: fingerprintId,
      fingerprint_request_id: fingerprintRequestId,
    });

    const data = response.data;
    if (data.userId) this.userId = data.userId;
    if (data.company?.uuid) this.companyId = data.company.uuid;
    // If JWT returned here, persist it too
    if (data.token && this.phone) {
      this.token = data.token;
      const expiresAt = this._jwtExpiry(data.token) ?? Math.floor(Date.now() / 1000) + 86400;
      this.tokenStore.save({
        phone: this.phone,
        token: this.token!,
        user_id: this.userId!,
        company_id: this.companyId!,
        expires_at: expiresAt,
      });
    }
    return data;
  }

  // Authenticated methods
  ensureAuth() {
    if (!this.token) {
      throw new Error('Not authenticated. Call login() first.');
    }
  }

  async getCompany(companyId?: string) {
    this.ensureAuth();
    const id = companyId || this.companyId;
    if (!id) throw new Error('Company ID required');

    const response = await this.axios.get(`/api/v1/companies/${id}`);
    return response.data;
  }

  async getUser(userId?: string) {
    this.ensureAuth();
    const id = userId || this.userId;
    if (!id) throw new Error('User ID required');

    const response = await this.axios.get(`/api/v1/users/${id}`);
    return response.data;
  }

  async getCurrentUser() {
    this.ensureAuth();
    const response = await this.axios.get('/api/v1/milky-way/users/me');
    return response.data;
  }

  async getSalesInvoices(
    filters: {
      number?: string;           // invoice number search
      global?: string;           // global text search
      client_name?: string[];    // partner name(s) — array
      client_uuid?: string[];    // partner UUID(s) — array
      status?: number[];         // payment status: 0=unpaid,1=paid,2=partial,3=overdue,4=draft,5=cancelled
      send_status?: number[];    // send status: 0=not sent,1=sent
      workflow_status?: string[]; // workflow/approval status
      document_reference?: string;
      object_tags?: string[];    // tags
      invoice_total?: string;    // total amount search
      amount_due?: string;       // amount due search
      start_invoice_date?: string; // YYYY-MM-DD
      end_invoice_date?: string;   // YYYY-MM-DD
      start_due_date?: string;     // YYYY-MM-DD
      end_due_date?: string;       // YYYY-MM-DD
      document_type?: string[];    // document type filter
      user_categories?: string[];  // category UUIDs
      reservation_number?: string;
      event_date?: string[];
      stamp_status?: string[];     // e-stamp status
      user_creator_ids?: string[]; // creator user UUIDs
      external_uuid?: string;
      invoice_status?: string[];   // invoice_status field (separate from status)
      myinvois_status?: string[];  // Malaysia e-invoice status
    } & Record<string, any>,
    first: number = 0,
    rows: number = 10,
    sortField: string = 'created_at',
    sortOrder: number = -1,
    show: 'existing' | 'deleted' | 'all' = 'existing',
    includeConnections: boolean = true,
  ) {
    this.ensureAuth();
    const response = await this.axios.post('/api/v1/invoicer/sales-invoices/all', {
      filters: {
        number:             { matchMode: 'undefined', value: filters.number ?? '' },
        global:             { matchMode: 'undefined', value: filters.global ?? '' },
        client_name:        { matchMode: 'undefined', value: filters.client_name ?? [] },
        client_uuid:        { matchMode: 'undefined', value: filters.client_uuid ?? [] },
        status:             { matchMode: 'undefined', value: filters.status ?? [] },
        send_status:        { matchMode: 'undefined', value: filters.send_status ?? [] },
        workflow_status:    { matchMode: 'undefined', value: filters.workflow_status ?? [] },
        document_reference: { matchMode: 'undefined', value: filters.document_reference ?? '' },
        object_tags:        { matchMode: 'undefined', value: filters.object_tags ?? [] },
        invoice_total:      { matchMode: 'undefined', value: filters.invoice_total ?? '' },
        amount_due:         { matchMode: 'undefined', value: filters.amount_due ?? '' },
        start_invoice_date: { matchMode: 'undefined', value: filters.start_invoice_date ?? '' },
        end_invoice_date:   { matchMode: 'undefined', value: filters.end_invoice_date ?? '' },
        start_due_date:     { matchMode: 'undefined', value: filters.start_due_date ?? '' },
        end_due_date:       { matchMode: 'undefined', value: filters.end_due_date ?? '' },
        document_type:      { matchMode: 'undefined', value: filters.document_type ?? [] },
        user_categories:    { matchMode: 'undefined', value: filters.user_categories ?? [] },
        reservation_number: { matchMode: 'undefined', value: filters.reservation_number ?? '' },
        event_date:         { matchMode: 'undefined', value: filters.event_date ?? [] },
        stamp_status:       { matchMode: 'undefined', value: filters.stamp_status ?? [] },
        user_creator_ids:   { matchMode: 'undefined', value: filters.user_creator_ids ?? [] },
        external_uuid:      { matchMode: 'undefined', value: filters.external_uuid ?? '' },
        invoice_status:     { matchMode: 'undefined', value: filters.invoice_status ?? [] },
        myinvois_status:    { matchMode: 'undefined', value: filters.myinvois_status ?? [] },
      },
      first,
      rows,
      sortOrder,
      sortField,
      file_type: 'csv',
      show,
      include_connections: includeConnections,
    });
    return response.data;
  }

  async getPartners(filters: any = {}, first: number = 0, rows: number = 10) {
    this.ensureAuth();
    const response = await this.axios.post('/api/v1/invoicer/partners/all', {
      filters: {
        global:  { matchMode: 'undefined', value: '' },
        name:    { matchMode: 'undefined', value: '' },
        email:   { matchMode: 'undefined', value: '' },
        phone:   { matchMode: 'undefined', value: '' },
        number:  { matchMode: 'undefined', value: '' },
        type:    { matchMode: 'undefined', value: [] },
        country: { matchMode: 'undefined', value: '' },
        ...filters,
      },
      first,
      rows,
      sortOrder: -1,
      sortField: 'created_at',
    });
    return response.data;
  }

  async getPartnerById(partnerId: string) {
    this.ensureAuth();
    const response = await this.axios.get(`/api/v1/invoicer/partners/${partnerId}`);
    return response.data;
  }

  async createPartner(data: {
    number: string;
    name: string;
    phone: string;
    phone_country_code?: string;
    email?: string;
    type?: 'Client' | 'Supplier' | 'Both';
    address1?: string;
    address2?: string;
    city?: string;
    state?: string;
    postal_code?: string;
    country?: string;
    website?: string;
    notes?: string;
    account_receivable_id?: string;
    account_payable_id?: string;
  }) {
    this.ensureAuth();
    const response = await this.axios.post('/api/v1/earth/partners', {
      number: data.number,
      name: data.name,
      email: data.email || '',
      phone: data.phone,
      phone_country_code: data.phone_country_code || 'ID',
      mobile: '',
      mobile_country_code: '',
      account_receivable_id: data.account_receivable_id || '',
      account_payable_id: data.account_payable_id || '',
      type: data.type || 'Both',
      partner_company_type: null,
      bank_accounts: [],
      delivery_address: [],
      address1: data.address1 || null,
      address2: data.address2 || null,
      city: data.city || null,
      state: data.state || null,
      postal_code: data.postal_code || '',
      country: data.country || null,
      website: data.website || null,
      notes: data.notes || '',
      entry_point: 'create-partner|api',
    });
    return response.data;
  }

  async updatePartner(partnerId: string, data: {
    number?: string;
    name?: string;
    phone?: string;
    phone_country_code?: string;
    email?: string;
    type?: 'Client' | 'Supplier' | 'Both';
    address1?: string;
    address2?: string;
    city?: string;
    state?: string;
    postal_code?: string;
    country?: string;
    website?: string;
    notes?: string;
    account_receivable_id?: string;
    account_payable_id?: string;
  }) {
    this.ensureAuth();
    const response = await this.axios.put(`/api/v1/invoicer/partners/${partnerId}`, {
      uuid: partnerId,
      ...data,
      mobile: '',
      mobile_country_code: '',
      bank_accounts: [],
      delivery_address: [],
      entry_point: 'edit-partner|api',
    });
    return response.data;
  }

  async deletePartner(partnerId: string) {
    this.ensureAuth();
    const response = await this.axios.delete(`/api/v1/earth/partners/${partnerId}`);
    return response.data;
  }

  async getPartnerNumber() {
    this.ensureAuth();
    const response = await this.axios.get('/api/v1/invoicer/partners/number');
    return response.data;
  }

  async getPartnerContacts(partnerId: string) {
    this.ensureAuth();
    const response = await this.axios.get(`/api/v1/invoicer/partner/contacts/${partnerId}`);
    return response.data;
  }

  async getPartnerBankAccounts(partnerId: string) {
    this.ensureAuth();
    const response = await this.axios.get(`/api/v1/invoicer/bank-account/${partnerId}?type=all`);
    return response.data;
  }

  // ─── Invoice endpoints ───────────────────────────────────────────────────

  async createInvoice(data: {
    partner_id: string;
    partner_name: string;
    number: string;
    invoice_date: string;       // YYYY-MM-DD
    due_date: string;           // YYYY-MM-DD
    items: Array<{
      item_name: string;
      item_description?: string;
      quantity: number;
      price: number;
      discount?: number;         // percentage 0-100
      tax_id?: string | null;
    }>;
    notes?: string;             // Keterangan — plain text or HTML
    terms?: string;             // Syarat & Ketentuan — plain text or HTML
    currency?: string;          // default: 'Rp'
    discount?: number;
    delivery_fee?: number;
    status?: number;            // 4=draft, 0=normal
    signature_text_header?: string;
    signature_text_footer?: string;
  }) {
    this.ensureAuth();

    // Generate a UUID for each item
    const makeUuid = () => {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });
    };

    const invoiceUuid = makeUuid();
    const items = data.items.map((item) => ({
      uuid: makeUuid(),
      item_name: item.item_name,
      item_description: item.item_description || '',
      quantity: String(item.quantity),
      price: item.price,
      discount: item.discount || 0,
      total: item.price * item.quantity,
      product_id: null,
      tax_id: item.tax_id || null,
      tax_total: 0,
      tax_exclusive: null,
      is_negative_value: null,
      product: null,
      custom_field: null,
      is_hide: false,
      discount_per_qty: null,
      total_without_additional_fee: item.price * item.quantity,
      net_total: item.price * item.quantity,
      total_before_tax: item.price * item.quantity,
    }));

    // Convert plain text notes/terms to HTML paragraphs
    const toHtml = (text?: string) => {
      if (!text) return '';
      if (text.startsWith('<')) return text; // already HTML
      return text.split('\n').map(line => `<p>${line || '<br>'}</p>`).join('');
    };

    // Use Node.js built-in FormData (Node 18+)
    const form = new (globalThis as any).FormData();
    form.append('uuid', invoiceUuid);
    form.append('partner_id', data.partner_id);
    form.append('partner_name', data.partner_name);
    form.append('client_name', '');
    form.append('invoice_date', data.invoice_date);
    form.append('due_date', data.due_date);
    form.append('status', String(data.status ?? 4));
    form.append('number', data.number);
    form.append('currency', data.currency || 'Rp');
    form.append('discount', String(data.discount || 0));
    form.append('delivery_fee', String(data.delivery_fee || 0));
    form.append('notes', toHtml(data.notes));
    form.append('terms', toHtml(data.terms));
    form.append('sent', '0');
    form.append('signature_text_header', data.signature_text_header || '');
    form.append('signature_text_footer', data.signature_text_footer || '');
    form.append('document_id', '');
    form.append('document_type_id', '');
    form.append('document_no', '');
    form.append('action', '');
    form.append('invoice_items', JSON.stringify(items));
    form.append('items', JSON.stringify(items));
    form.append('is_top_plus', '0');
    form.append('document_reference', '');
    form.append('stamped_pdf', '');

    const response = await this.axios.post('/api/v1/invoicer/sales-invoices', form);
    return response.data;
  }

  async getSalesInvoice(invoiceId: string) {
    this.ensureAuth();
    const response = await this.axios.get(`/api/v1/invoicer/sales-invoices-v2/${invoiceId}`);
    return response.data;
  }

  async getSalesInvoicePdf(invoiceId: string) {
    this.ensureAuth();
    const response = await this.axios.get(`/api/v1/invoicer/sales-invoices/pdf/${invoiceId}`);
    return response.data;
  }

  async sendInvoice(invoiceId: string, options: {
    whatsapp?: { number: string };
    email?: { to: string; cc?: string };
    sms?: { number: string };
  }) {
    this.ensureAuth();
    const response = await this.axios.post(
      `/api/v1/invoicer/sales-invoices/send-all/${invoiceId}`,
      options
    );
    return response.data;
  }

  async generateInvoiceQris(invoiceId: string) {
    this.ensureAuth();
    const response = await this.axios.post(
      `/api/v1/invoicer/sales-invoices/${invoiceId}/qris`,
      {}
    );
    return response.data;
  }

  async deleteInvoice(invoiceId: string) {
    this.ensureAuth();
    const response = await this.axios.delete(`/api/v1/invoicer/sales-invoices/${invoiceId}`);
    return response.data;
  }

  async publishInvoice(invoiceId: string, statusCode: number = 0) {
    this.ensureAuth();
    // GET /api/v1/invoicer/invoice/change-status/{uuid}/{status_code}
    // No body — status code in URL path
    // 0=posted/unpaid, 4=draft, 5=cancelled
    const response = await this.axios.get(
      `/api/v1/invoicer/invoice/change-status/${invoiceId}/${statusCode}`
    );
    return response.data;
  }

  async updateInvoice(invoiceId: string, data: {
    partner_id: string;
    partner_name: string;
    number: string;
    invoice_date: string;
    due_date: string;
    items: Array<{
      item_name: string;
      item_description?: string;
      quantity: number;
      price: number;
      discount?: number;
      tax_id?: string | null;
    }>;
    notes?: string;
    terms?: string;
    currency?: string;
    discount?: number;
    delivery_fee?: number;
    status?: number;
    signature_text_header?: string;
    signature_text_footer?: string;
  }) {
    this.ensureAuth();

    const makeUuid = () =>
      'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });

    const items = data.items.map((item) => ({
      uuid: makeUuid(),
      item_name: item.item_name,
      item_description: item.item_description || '',
      quantity: String(item.quantity),
      price: item.price,
      discount: item.discount || 0,
      total: item.price * item.quantity,
      product_id: null,
      tax_id: item.tax_id || null,
      tax_total: 0,
      tax_exclusive: null,
      is_negative_value: null,
      product: null,
      custom_field: null,
      is_hide: false,
      discount_per_qty: null,
      total_without_additional_fee: item.price * item.quantity,
      net_total: item.price * item.quantity,
      total_before_tax: item.price * item.quantity,
    }));

    const toHtml = (text?: string) => {
      if (!text) return '';
      if (text.startsWith('<')) return text;
      return text.split('\n').map(line => `<p>${line || '<br>'}</p>`).join('');
    };

    const form = new (globalThis as any).FormData();
    form.append('uuid', invoiceId);
    form.append('partner_id', data.partner_id);
    form.append('partner_name', data.partner_name);
    form.append('client_name', '');
    form.append('invoice_date', data.invoice_date);
    form.append('due_date', data.due_date);
    form.append('status', String(data.status ?? 0));
    form.append('number', data.number);
    form.append('currency', data.currency || 'Rp');
    form.append('discount', String(data.discount || 0));
    form.append('delivery_fee', String(data.delivery_fee || 0));
    form.append('notes', toHtml(data.notes));
    form.append('terms', toHtml(data.terms));
    form.append('sent', '0');
    form.append('signature_text_header', data.signature_text_header || '');
    form.append('signature_text_footer', data.signature_text_footer || '');
    form.append('document_id', '');
    form.append('document_type_id', '');
    form.append('document_no', '');
    form.append('action', '');
    form.append('invoice_items', JSON.stringify(items));
    form.append('items', JSON.stringify(items));
    form.append('is_top_plus', '0');
    form.append('document_reference', '');
    form.append('stamped_pdf', '');

    const response = await this.axios.post(
      `/api/v1/invoicer/sales-invoices/${invoiceId}`,
      form
    );
    return response.data;
  }

  async searchPartners(nameFilter: string = '', first: number = 0, rows: number = 50, type?: string) {
    this.ensureAuth();
    const response = await this.axios.post('/api/v1/earth/partners/all', {
      filters: {
        name: { matchMode: 'contains', value: nameFilter },
        email: { matchMode: 'undefined', value: '' },
        phone: { matchMode: 'undefined', value: '' },
        country: { matchMode: 'undefined', value: '' },
        global: { matchMode: 'undefined', value: '' },
        number: { matchMode: 'undefined', value: '' },
      },
      first,
      rows,
      sortField: 'created_at',
      sortOrder: -1,
      type: type || 'Client',
      includes: [],
    });
    return response.data;
  }

  // ─── Account insights ────────────────────────────────────────────────────

  async getAccountReceivableInsight() {
    this.ensureAuth();
    const response = await this.axios.get('/api/v1/reporting/account-receivable/insight');
    return response.data;
  }

  async getAccountPayableInsight() {
    this.ensureAuth();
    const response = await this.axios.get('/api/v1/reporting/account-payable/insight');
    return response.data;
  }

  async getProfitAndLoss(filters: any = {}) {
    this.ensureAuth();
    const response = await this.axios.post('/api/v1/reporting/dashboard/profit-and-loss', filters);
    return response.data;
  }

  async getKycStatus() {
    this.ensureAuth();
    const response = await this.axios.get('/api/v1/paper-kyc/kyc');
    return response.data;
  }

  async getUserPackage() {
    this.ensureAuth();
    const response = await this.axios.get('/api/v1/users/package');
    return response.data;
  }

  async getOnboardingStatus() {
    this.ensureAuth();
    const response = await this.axios.get('/api/v1/milky-way/companies/onboarding-status');
    return response.data;
  }

  async getReferralLink() {
    this.ensureAuth();
    const response = await this.axios.get('/api/v1/referral-code/link');
    return response.data;
  }

  async getNotifications() {
    this.ensureAuth();
    const response = await this.axios.post('/api/v1/notification/notifications', {});
    return response.data;
  }

  async getDashboardTodoList() {
    this.ensureAuth();
    const response = await this.axios.get('/api/v1/invoicer/dashboard/to-do-list');
    return response.data;
  }

  async getBanners(platform: string = 'web') {
    this.ensureAuth();
    const response = await this.axios.get(`/api/v1/reporting/banners?platform=${platform}`);
    return response.data;
  }

  // ── Payments (Kuitansi Penjualan) ──────────────────────────────────────────

  /**
   * Get next auto-generated payment number.
   * document_type_id: 'pay-01' (receipt/kuitansi penjualan)
   */
  async getPaymentNumber(documentTypeId: string = 'pay-01') {
    this.ensureAuth();
    const response = await this.axios.get(`/api/v1/invoicer/payments/number/${documentTypeId}`);
    return response.data; // { data: { payment_next_number, payment_hash, ... }, no_payment: 'PYI/2026/0010' }
  }

  /**
   * Get all finance accounts (bank + cash accounts) — used in payment form dropdown.
   * Returns { finance_accounts: [...] }
   */
  async getFinanceAccounts() {
    this.ensureAuth();
    const response = await this.axios.get('/api/v1/finance/accounts');
    return response.data;
  }

  /**
   * Create a payment receipt (Kuitansi Penjualan).
   *
   * Payment methods (static list):
   *   'Memo' | 'Credit Card' | 'Bank Transfer' | 'Cash' | 'Digital Payment'
   *   → mapped to method UUIDs by the API (browser sends UUID, not label).
   *   Known UUID: Bank Transfer = '2b00cf25-2fe0-420d-b045-3bc94445dd8b'
   *   Use getPaymentMethodId() helper or pass raw UUID.
   *
   * @param payments - array of payment objects (usually 1)
   */
  async createPayment(payments: Array<{
    invoice_id: string;                  // invoice UUID
    invoice_document_type_id?: string;   // default 'inv-01'
    amount: number;                      // payment amount in IDR
    payment_date?: string;               // ISO date string, default now
    finance_account_id: string;          // UUID from getFinanceAccounts()
    method: string;                      // payment method UUID (see PAYMENT_METHODS)
    partner_id: string;                  // partner UUID
    number?: string;                     // payment number e.g. 'PYI/2026/0010' (auto from getPaymentNumber)
    notes?: string;
    document_reference?: string;
    type?: 'In' | 'Out';                 // 'In' = received payment (default)
    foreign_currency_setting?: {
      currency_code: string;
      currency_rate: number;
      estimation_date?: string;
      is_show?: boolean;
    };
  }>) {
    this.ensureAuth();
    const payload = payments.map(p => ({
      payment_date: p.payment_date ?? new Date().toISOString(),
      finance_account_id: p.finance_account_id,
      amount: p.amount,
      method: p.method,
      type: p.type ?? 'In',
      invoices: [{
        invoice_id: p.invoice_id,
        amount: p.amount,
        invoice_document_type_id: p.invoice_document_type_id ?? 'inv-01',
      }],
      partner_id: p.partner_id,
      notes: p.notes ?? '',
      number: p.number ?? '',
      document_reference: p.document_reference ?? '',
      ...(p.foreign_currency_setting ? { foreign_currency_setting: p.foreign_currency_setting } : {}),
    }));
    const response = await this.axios.post('/api/v1/invoicer/payments', { payments: payload });
    return response.data;
  }

  /**
   * Get payments for a specific invoice.
   */
  async getInvoicePayments(invoiceId: string) {
    this.ensureAuth();
    const response = await this.axios.get(`/api/v1/invoicer/payments/${invoiceId}`);
    return response.data;
  }

  /**
   * Delete a payment receipt by UUID.
   */
  async deletePayment(paymentId: string) {
    this.ensureAuth();
    const response = await this.axios.delete(`/api/v1/invoicer/payments/${paymentId}`);
    return response.data;
  }

  /**
   * Send a payment receipt via WhatsApp/email/SMS.
   * Same body shape as sendInvoice.
   */
  async sendPayment(paymentId: string, options: {
    whatsapp?: { number: string };    // phone with country code e.g. '628996926184'
    email?: { to: string; cc?: string };
    sms?: { number: string };
  }) {
    this.ensureAuth();
    const response = await this.axios.post(`/api/v1/invoicer/payments/send/${paymentId}`, options);
    return response.data;
  }

  /**
   * Get payment receipt PDF data (settings + payment object).
   */
  async getPaymentPdf(paymentId: string) {
    this.ensureAuth();
    const response = await this.axios.get(`/api/v1/invoicer/payments/pdf/${paymentId}`);
    return response.data;
  }

  /**
   * Get payment methods list (dynamic, company-specific UUIDs).
   * Returns { payment_methods: [{uuid, name, active_in, active_out, is_digital_payment}] }
   */
  async getPaymentMethods() {
    this.ensureAuth();
    const response = await this.axios.get('/api/v1/invoicer/payment-methods');
    return response.data;
  }

  /**
   * Get PaperPay In balance (Saldo Aktif).
   * Returns { balance, credit_balance, debit_balance, on_hold_amount, on_hold_amount_disbursement }
   * Endpoint: GET /api/v1/payment-api/disbursement/finance-account
   */
  async getPaperPayBalance() {
    this.ensureAuth();
    const response = await this.axios.get('/api/v1/payment-api/disbursement/finance-account');
    return response.data;
  }

  /**
   * Get PaperPay In digital payment transactions.
   * Endpoint: POST /api/v1/payment-api/reconcile/all
   */
  async getDigitalPaymentTransactions(opts: {
    filters?: {
      partner_name?: string;
      payment_method?: string[];
      payment_provider?: string[];
      sub_total?: number;
      transaction_fee?: number;
      disbursed_amount?: number;
      transaction_date?: { from?: string; to?: string };
      external_id?: string;
      status?: string[];
    };
    first?: number;
    rows?: number;
    sortField?: string;
    sortOrder?: number;
    status?: string;  // 'settled' | 'pending' | 'all'
  } = {}) {
    this.ensureAuth();
    const body = {
      filters: {
        partner_name:     { value: opts.filters?.partner_name ?? '' },
        payment_method:   { value: opts.filters?.payment_method ?? [] },
        payment_provider: { value: opts.filters?.payment_provider ?? [] },
        sub_total:        { value: opts.filters?.sub_total ?? 0 },
        transaction_fee:  { value: opts.filters?.transaction_fee ?? 0 },
        disbursed_amount: { value: opts.filters?.disbursed_amount ?? 0 },
        transaction_date: { from: opts.filters?.transaction_date?.from ?? '', to: opts.filters?.transaction_date?.to ?? '' },
        external_id:      { value: opts.filters?.external_id ?? '' },
        status:           { value: opts.filters?.status ?? [] },
        cost_bearer:      { value: [] },
        parent_external_id: { value: '' },
      },
      first: opts.first ?? 0,
      rows: opts.rows ?? 10,
      sortField: opts.sortField ?? 'transaction_date',
      sortOrder: opts.sortOrder ?? -1,
      status: opts.status ?? 'settled',
    };
    const response = await this.axios.post('/api/v1/payment-api/reconcile/all', body);
    return response.data;
  }

  /** Known payment method UUIDs (captured from real API — company-specific but typically stable) */
  static readonly PAYMENT_METHODS: Record<string, string> = {
    'Memo':            '06064a30-b521-41dd-84f5-d5ef7e0f6077',
    'Credit Card':     '0e27ae62-8b71-4072-8d98-998927116c06',
    'Bank Transfer':   '2b00cf25-2fe0-420d-b045-3bc94445dd8b',
    'Journal Entry':   '59dea5bc-0bbe-46b1-bc6c-391f73a93291',
    'Cash':            'c0bb3a7d-c5e4-42af-b50f-7a7d961fd9c1',
    'Digital Payment': 'c36904a1-c6e2-4d79-80b8-d5cef0a52718',
    'Check':           'dd72763a-29b4-44d7-a900-b705b5f27c08',
  };

  // Getters
  getToken() {
    return this.token;
  }

  getCompanyId() {
    return this.companyId;
  }

  getUserId() {
    return this.userId;
  }

  setToken(token: string) {
    this.token = token;
  }

  setCompanyId(companyId: string) {
    this.companyId = companyId;
  }

  setUserId(userId: string) {
    this.userId = userId;
  }

  // ─── Products ───────────────────────────────────────────────────────────────

  /**
   * List products. Endpoint: POST /api/v1/inventory/products/all
   * Filters: name, code, category_name, sales_price, purchase_price, uom_name, description, track_stock
   */
  async getProducts(opts: {
    filters?: {
      name?: string;
      code?: string;
      category_name?: string;
      sales_price?: string;
      purchase_price?: string;
      uom_name?: string;
      description?: string;
      track_stock?: string;
    };
    first?: number;
    rows?: number;
    sortField?: string;
    sortOrder?: number;
  } = {}) {
    this.ensureAuth();
    const body = {
      filters: {
        name:           { matchMode: 'undefined', value: opts.filters?.name ?? '' },
        global:         { matchMode: 'undefined', value: '' },
        code:           { matchMode: 'undefined', value: opts.filters?.code ?? '' },
        sales_price:    { matchMode: 'undefined', value: opts.filters?.sales_price ?? '' },
        category_name:  { matchMode: 'undefined', value: opts.filters?.category_name ?? '' },
        purchase_price: { matchMode: 'undefined', value: opts.filters?.purchase_price ?? '' },
        uom_name:       { matchMode: 'undefined', value: opts.filters?.uom_name ?? '' },
        track_stock:    { matchMode: 'undefined', value: opts.filters?.track_stock ?? '' },
        grey:           { matchMode: 'undefined', value: '' },
        description:    { matchMode: 'undefined', value: opts.filters?.description ?? '' },
      },
      first: opts.first ?? 0,
      rows: opts.rows ?? 10,
      sortOrder: opts.sortOrder ?? -1,
      sortField: opts.sortField ?? 'created_at',
    };
    const response = await this.axios.post('/api/v1/inventory/products/all', body);
    return response.data;
  }

  /** Get single product. Endpoint: GET /api/v1/invoicer/products/{uuid} */
  async getProduct(productId: string) {
    this.ensureAuth();
    const response = await this.axios.get(`/api/v1/invoicer/products/${productId}`);
    return response.data;
  }

  /** Get next SKU code. Endpoint: GET /api/v1/invoicer/products/sku/ */
  async getNextProductSku() {
    this.ensureAuth();
    const response = await this.axios.get('/api/v1/invoicer/products/sku/');
    return response.data;
  }

  /**
   * Create product. Endpoint: POST /api/v1/invoicer/products
   * Required: code, name. Optional: description, sales_price, purchase_price, category_id, uom_id, track_stock
   */
  async createProduct(data: {
    code: string;
    name: string;
    description?: string;
    sales_price?: number;
    purchase_price?: number;
    category_id?: string;
    uom_id?: string;
    track_stock?: number;
  }) {
    this.ensureAuth();
    const response = await this.axios.post('/api/v1/invoicer/products', data);
    return response.data;
  }

  /**
   * Update product. Endpoint: PUT /api/v1/invoicer/products/{uuid}
   * Required: code, name. Others optional.
   */
  async updateProduct(productId: string, data: {
    code?: string;
    name?: string;
    description?: string;
    sales_price?: number;
    purchase_price?: number;
    category_id?: string;
    uom_id?: string;
    track_stock?: number;
  }) {
    this.ensureAuth();
    const response = await this.axios.put(`/api/v1/invoicer/products/${productId}`, data);
    return response.data;
  }

  /** Delete product. Endpoint: DELETE /api/v1/invoicer/products/{uuid} */
  async deleteProduct(productId: string) {
    this.ensureAuth();
    const response = await this.axios.delete(`/api/v1/invoicer/products/${productId}`);
    return response.data;
  }

  /** List product categories. Endpoint: GET /api/v1/invoicer/categories */
  async getProductCategories() {
    this.ensureAuth();
    const response = await this.axios.get('/api/v1/invoicer/categories');
    return response.data;
  }

  /** Get single product category. Endpoint: GET /api/v1/invoicer/categories/{uuid} */
  async getProductCategory(categoryId: string) {
    this.ensureAuth();
    const response = await this.axios.get(`/api/v1/invoicer/categories/${categoryId}`);
    return response.data;
  }

  /**
   * Create product category. Endpoint: POST /api/v1/invoicer/categories
   * Fields: name, description, category_parent_id (optional)
   */
  async createProductCategory(data: {
    name: string;
    description?: string;
    category_parent_id?: string;
    minimum_order_quantity?: number;
  }) {
    this.ensureAuth();
    const response = await this.axios.post('/api/v1/invoicer/categories', data);
    return response.data;
  }

  /** Update product category. Endpoint: PUT /api/v1/invoicer/categories/{uuid} */
  async updateProductCategory(categoryId: string, data: {
    name?: string;
    description?: string;
    category_parent_id?: string;
    minimum_order_quantity?: number;
  }) {
    this.ensureAuth();
    const response = await this.axios.put(`/api/v1/invoicer/categories/${categoryId}`, data);
    return response.data;
  }

  /** Delete product category. Endpoint: DELETE /api/v1/invoicer/categories/{uuid} */
  async deleteProductCategory(categoryId: string) {
    this.ensureAuth();
    const response = await this.axios.delete(`/api/v1/invoicer/categories/${categoryId}`);
    return response.data;
  }

  /**
   * List units of measure. Endpoint: POST /api/v2/saturn/uom/all
   * 150 global units available.
   */
  async getUnitsOfMeasure(opts: { first?: number; rows?: number } = {}) {
    this.ensureAuth();
    const body = {
      filters: { global: { matchMode: 'undefined', value: '' } },
      first: opts.first ?? 0,
      rows: opts.rows ?? 50,
      sortOrder: -1,
      sortField: 'created_at',
    };
    const response = await this.axios.post('/api/v2/saturn/uom/all', body);
    return response.data;
  }

  /**
   * Create unit of measure. Endpoint: POST /api/v2/saturn/uom
   * Fields: name (required), symbol (required), description (optional)
   */
  async createUnitOfMeasure(data: { name: string; symbol: string; description?: string }) {
    this.ensureAuth();
    const response = await this.axios.post('/api/v2/saturn/uom', data);
    return response.data;
  }

  /** Update unit of measure. Endpoint: PUT /api/v2/saturn/uom/{uuid} */
  async updateUnitOfMeasure(uomId: string, data: { name?: string; symbol?: string; description?: string }) {
    this.ensureAuth();
    const response = await this.axios.put(`/api/v2/saturn/uom/${uomId}`, data);
    return response.data;
  }

  /** Delete unit of measure. Endpoint: DELETE /api/v2/saturn/uom/{uuid} */
  async deleteUnitOfMeasure(uomId: string) {
    this.ensureAuth();
    const response = await this.axios.delete(`/api/v2/saturn/uom/${uomId}`);
    return response.data;
  }

  // ─── UoM Categories (Kategori Unit) ───────────────────────────────────────────

  /**
   * List UoM categories. Endpoint: POST /api/v1/saturn/uom-category/all
   * Returns: { body: { uom_categories: [], total_records: N } }
   */
  async getUomCategories(opts: { first?: number; rows?: number } = {}) {
    this.ensureAuth();
    const body = {
      filters: { global: { matchMode: 'undefined', value: '' } },
      first: opts.first ?? 0,
      rows: opts.rows ?? 50,
      sortOrder: -1,
      sortField: 'created_at',
    };
    const response = await this.axios.post('/api/v1/saturn/uom-category/all', body);
    return response.data;
  }

  /** Get single UoM category. Endpoint: GET /api/v1/saturn/uom-category/{uuid} */
  async getUomCategory(categoryId: string) {
    this.ensureAuth();
    const response = await this.axios.get(`/api/v1/saturn/uom-category/${categoryId}`);
    return response.data;
  }

  /**
   * Create UoM category. Endpoint: POST /api/v1/saturn/uom-category
   * Fields: name (required), uoms (array of UoM UUIDs, optional)
   */
  async createUomCategory(data: { name: string; uoms?: string[] }) {
    this.ensureAuth();
    const response = await this.axios.post('/api/v1/saturn/uom-category', {
      name: data.name,
      uoms: data.uoms ?? [],
    });
    return response.data;
  }

  /** Update UoM category. Endpoint: PUT /api/v1/saturn/uom-category/{uuid} */
  async updateUomCategory(categoryId: string, data: { name?: string; uoms?: string[] }) {
    this.ensureAuth();
    const response = await this.axios.put(`/api/v1/saturn/uom-category/${categoryId}`, {
      name: data.name,
      uoms: data.uoms ?? [],
    });
    return response.data;
  }

  /** Delete UoM category. Endpoint: DELETE /api/v1/saturn/uom-category/{uuid} */
  async deleteUomCategory(categoryId: string) {
    this.ensureAuth();
    const response = await this.axios.delete(`/api/v1/saturn/uom-category/${categoryId}`);
    return response.data;
  }
}
