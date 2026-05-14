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

  async getSalesInvoices(filters: any = {}, first: number = 0, rows: number = 10) {
    this.ensureAuth();
    const response = await this.axios.post('/api/v1/invoicer/sales-invoices/all', {
      filters: {
        number: { matchMode: 'undefined', value: '' },
        global: { matchMode: 'undefined', value: '' },
        client_name: { matchMode: 'undefined', value: null },
        partner_id: { matchMode: 'undefined', value: '' },
        status: { matchMode: 'undefined', value: [] },
        invoice_total: { matchMode: 'undefined', value: '' },
        send_status: { matchMode: 'undefined', value: [] },
        start_invoice_date: { matchMode: 'undefined', value: '' },
        end_invoice_date: { matchMode: 'undefined', value: '' },
        ...filters,
      },
      first,
      rows,
      sortOrder: -1,
      sortField: 'created_at',
      file_type: 'csv',
      show: 'existing',
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
}
