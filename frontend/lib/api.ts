/**
 * AgroRaiz - API Client
 * Typed HTTP client for all backend endpoints.
 * Replaces mock-data.ts for production use.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

// ─── Response shapes (match backend exactly — see app/api/v1/endpoints/) ───────

export interface DashboardMetrics {
  period: string
  generated_at: string
  customers: { total: number; new: number; trend: number }
  revenue: { total: number; prev: number; trend: number; orders: number; avg_ticket: number }
  conversations: {
    total: number
    open: number
    ai_resolved: number
    human_takeovers: number
    awaiting_human: number
    ai_resolution_rate: number
    hours_saved: number
  }
  inventory: { total: number; low_stock: number; out_of_stock: number }
  campaigns: { active: number; scheduled: number; draft: number; pending: number }
}

export interface ActiveConversationSummary {
  id: string
  status: string
  prioridade: string
  motivo_transferencia: string | null
  cliente: { nome: string | null; telefone: string | null } | null
  updated_at: string | null
}

export interface DashboardActivity {
  active_conversations: ActiveConversationSummary[]
  total: number
}

export interface ConversationListItem {
  id: string
  channel: string
  status: string
  prioridade: string
  sentimento: string
  assunto: string | null
  motivo_transferencia: string | null
  created_at: string | null
  updated_at: string | null
  cliente?: {
    id: string
    nome: string | null
    telefone: string | null
    frequencia: string | null
  }
  [key: string]: unknown
}

export interface ConversationListResponse {
  conversations: ConversationListItem[]
  total: number
}

export interface ConversationMessage {
  id: string
  remetente: string
  conteudo: string
  created_at: string
  [key: string]: unknown
}

export interface ConversationMessagesResponse {
  messages: ConversationMessage[]
  total: number
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

const AUTH_COOKIE = 'agroraiz_token'
/** Matches backend JWT_ACCESS_TOKEN_EXPIRE_MINUTES (60) */
const ACCESS_TOKEN_MAX_AGE = 60 * 60

let _accessToken: string | null = null

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  for (const entry of document.cookie.split('; ')) {
    const eq = entry.indexOf('=')
    if (eq === -1) continue
    const key = entry.slice(0, eq)
    const value = entry.slice(eq + 1)
    if (key === name) return decodeURIComponent(value)
  }
  return null
}

function setCookie(name: string, value: string, maxAge: number) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; SameSite=Lax`
}

function deleteCookie(name: string) {
  document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax`
}

export function setAccessToken(token: string | null) {
  _accessToken = token
  if (typeof window === 'undefined') return
  if (token) {
    setCookie(AUTH_COOKIE, token, ACCESS_TOKEN_MAX_AGE)
    localStorage.removeItem('agroraiz_token')
  } else {
    deleteCookie(AUTH_COOKIE)
    localStorage.removeItem('agroraiz_token')
  }
}

export function getAccessToken(): string | null {
  if (_accessToken) return _accessToken
  if (typeof window !== 'undefined') {
    const fromCookie = getCookie(AUTH_COOKIE)
    if (fromCookie) {
      _accessToken = fromCookie
      return fromCookie
    }
    const legacy = localStorage.getItem('agroraiz_token')
    if (legacy) {
      setAccessToken(legacy)
      return legacy
    }
  }
  return null
}

async function tryRefreshAccessToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem('agroraiz-auth')
    if (!raw) return null
    const parsed = JSON.parse(raw) as { state?: { refreshToken?: string } }
    const refreshToken = parsed.state?.refreshToken
    if (!refreshToken) return null

    const res = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    })
    if (!res.ok) return null
    const data = (await res.json()) as RefreshResponse
    setAccessToken(data.access_token)
    return data.access_token
  } catch {
    return null
  }
}

// ─── Base fetch ───────────────────────────────────────────────────────────────

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  requireAuth = true,
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }

  if (requireAuth) {
    const token = getAccessToken()
    if (token) headers['Authorization'] = `Bearer ${token}`
  }

  const res = await fetch(`${API_BASE}/api/v1${path}`, {
    ...options,
    headers,
  })

  if (res.status === 401 && requireAuth) {
    const newToken = await tryRefreshAccessToken()
    if (newToken) {
      headers['Authorization'] = `Bearer ${newToken}`
      const retry = await fetch(`${API_BASE}/api/v1${path}`, { ...options, headers })
      if (retry.ok) return retry.json()
    }
    setAccessToken(null)
    if (typeof window !== 'undefined') {
      window.location.href = '/login'
    }
    throw new Error('Unauthorized')
  }

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: 'Erro desconhecido' }))
    throw new Error(error.detail || `HTTP ${res.status}`)
  }

  return res.json()
}

// ─── Auth API ─────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string
  name: string
  email: string
  role: 'owner' | 'admin' | 'attendant' | 'viewer'
  store_id: string
  avatar_url: string | null
}

export interface LoginResponse {
  access_token: string
  refresh_token: string
  token_type: string
  user: AuthUser
}

export interface RefreshResponse {
  access_token: string
}

export const authApi = {
  login: (email: string, password: string) =>
    apiFetch<LoginResponse>(
      '/auth/login',
      {
        method: 'POST',
        body: new URLSearchParams({ username: email, password }).toString(),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      },
      false,
    ),

  me: () => apiFetch<AuthUser>('/auth/me'),

  refresh: (refreshToken: string) =>
    apiFetch<RefreshResponse>('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: refreshToken }),
    }, false),
}

// ─── Dashboard API ────────────────────────────────────────────────────────────

export const dashboardApi = {
  getMetrics: (period: '7d' | '30d' | '90d' = '30d') =>
    apiFetch<DashboardMetrics>(`/dashboard/metrics?period=${period}`),

  getActivity: (limit = 20) =>
    apiFetch<DashboardActivity>(`/dashboard/activity?limit=${limit}`),
}

// ─── Customers (CRM) ─────────────────────────────────────────────────────────

export const customersApi = {
  list: (params: {
    busca?: string
    status?: string
    frequencia?: string
    page?: number
    pageSize?: number
  } = {}) => {
    const q = new URLSearchParams()
    if (params.busca) q.set('busca', params.busca)
    if (params.status) q.set('status', params.status)
    if (params.frequencia) q.set('frequencia', params.frequencia)
    q.set('offset', String(((params.page || 1) - 1) * (params.pageSize || 50)))
    q.set('limit', String(params.pageSize || 50))
    return apiFetch(`/customers?${q}`)
  },

  get: (id: string) => apiFetch(`/customers/${id}`),

  create: (data: Record<string, unknown>) =>
    apiFetch('/customers', { method: 'POST', body: JSON.stringify(data) }),

  update: (id: string, data: Record<string, unknown>) =>
    apiFetch(`/customers/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  delete: (id: string) =>
    apiFetch(`/customers/${id}`, { method: 'DELETE' }),

  getInteractions: (id: string) =>
    apiFetch(`/customers/${id}/interactions`),

  getAnalytics: () => apiFetch('/customers/analytics'),
}

// ─── Products (Estoque) ───────────────────────────────────────────────────────

export const productsApi = {
  list: (params: {
    busca?: string
    categoria?: string
    ativo?: boolean
    destaque?: boolean
    estoque_baixo?: boolean
    promocao?: boolean
    estoque_status?: string
    page?: number
    page_size?: number
  } = {}) => {
    const q = new URLSearchParams()
    if (params.busca) q.set('busca', params.busca)
    if (params.categoria) q.set('categoria', params.categoria)
    if (params.ativo !== undefined) q.set('ativo', String(params.ativo))
    if (params.destaque !== undefined) q.set('destaque', String(params.destaque))
    if (params.estoque_baixo) q.set('estoque_baixo', 'true')
    if (params.promocao) q.set('promocao', 'true')
    if (params.estoque_status) q.set('estoque_status', params.estoque_status)
    q.set('page', String(params.page || 1))
    if (params.page_size) q.set('page_size', String(params.page_size))
    return apiFetch(`/products?${q}`)
  },

  getSummary: () => apiFetch<{
    total: number
    ativos: number
    inativos: number
    zerados: number
    abaixo_minimo: number
    promocao: number
  }>('/products/summary'),

  get: (id: string) => apiFetch(`/products/${id}`),

  create: (data: Record<string, unknown>) =>
    apiFetch('/products', { method: 'POST', body: JSON.stringify(data) }),

  update: (id: string, data: Record<string, unknown>) =>
    apiFetch(`/products/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  updateStock: (
    id: string,
    quantity: number,
    operation: 'adicionar' | 'remover' | 'corrigir',
    motivo: string,
  ) =>
    apiFetch(`/products/${id}/stock`, {
      method: 'POST',
      body: JSON.stringify({ quantity, operation, motivo }),
    }),

  getLowStock: () => apiFetch('/products/low-stock'),
}

// ─── Categories ───────────────────────────────────────────────────────────────

export interface ProductCategory {
  id: string
  name: string
  slug: string
  active: boolean
  product_count: number
  created_at: string | null
}

export const categoriesApi = {
  list: (includeInactive = false) =>
    apiFetch<{ categories: ProductCategory[] }>(
      `/categories?include_inactive=${includeInactive}`,
    ),

  create: (name: string) =>
    apiFetch<ProductCategory>('/categories', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),

  update: (id: string, data: { name?: string; active?: boolean }) =>
    apiFetch<ProductCategory>(`/categories/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    apiFetch(`/categories/${id}`, { method: 'DELETE' }),
}

// ─── Conversations ────────────────────────────────────────────────────────────

export const conversationsApi = {
  list: (params: { status?: string; canal?: string } = {}) => {
    const q = new URLSearchParams()
    if (params.status) q.set('status', params.status)
    if (params.canal) q.set('canal', params.canal)
    return apiFetch<ConversationListResponse>(`/conversations?${q}`)
  },

  getMessages: (id: string, limit = 50) =>
    apiFetch<ConversationMessagesResponse>(`/conversations/${id}/messages?limit=${limit}`),

  updateStatus: (id: string, status: string) =>
    apiFetch<{ status: string }>(`/conversations/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),
}

// ─── WhatsApp ─────────────────────────────────────────────────────────────────

export const whatsappApi = {
  getStatus: () => apiFetch('/whatsapp/status'),

  sendMessage: (phone: string, message: string) =>
    apiFetch('/whatsapp/send', {
      method: 'POST',
      body: JSON.stringify({ phone, message }),
    }),

  getMessages: (phone: string, limit = 50) =>
    apiFetch(`/whatsapp/messages/${phone}?limit=${limit}`),

  resumeAutomation: (phone: string) =>
    apiFetch('/whatsapp/resume-automation', {
      method: 'POST',
      body: JSON.stringify({ phone }),
    }),

  pauseAutomation: (phone: string) =>
    apiFetch('/whatsapp/pause-automation', {
      method: 'POST',
      body: JSON.stringify({ phone }),
    }),

  getHumanQueue: () => apiFetch('/whatsapp/queue/human'),
}

// ─── AI ───────────────────────────────────────────────────────────────────────

export const aiApi = {
  generateContent: (type: string, topic?: string, season?: string) =>
    apiFetch('/ai/generate-content', {
      method: 'POST',
      body: JSON.stringify({ type, topic, season }),
    }),

  getMetrics: () => apiFetch('/ai/metrics'),
}

// ─── Campaigns ────────────────────────────────────────────────────────────────

export const campaignsApi = {
  list: () => apiFetch('/campaigns'),

  create: (data: Record<string, unknown>) =>
    apiFetch('/campaigns', { method: 'POST', body: JSON.stringify(data) }),

  update: (id: string, data: Record<string, unknown>) =>
    apiFetch(`/campaigns/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  launch: (id: string) =>
    apiFetch(`/campaigns/${id}/launch`, { method: 'POST' }),
}

// ─── Store profile ────────────────────────────────────────────────────────────

export interface StoreVitrineSettings {
  hero_badge: string
  hero_title: string
  hero_subtitle: string
  hero_cta_label: string
  about_title: string
  about_text: string
  about_text_extra: string
  products_title: string
  products_intro: string
  cta_title: string
  cta_text: string
  promo_message: string
  whatsapp_message: string
  featured_categories: string[]
  testimonials: { name: string; role: string; content: string; rating?: number }[]
}

export interface StoreLinks {
  instagram_url: string
  google_maps_url: string
  whatsapp_url: string
}

export interface StoreProfile {
  id: string
  name: string
  slug: string
  phone: string | null
  phone_display: string | null
  whatsapp: string | null
  whatsapp_display: string | null
  instagram: string | null
  instagram_url: string | null
  email: string | null
  city: string | null
  state: string | null
  logo_url: string | null
  tagline: string
  short_description: string
  description: string
  address: string
  opening_hours: string
  vitrine: StoreVitrineSettings
  links: StoreLinks
  available_categories?: { key: string; label: string }[]
}

export interface FeaturedCategory {
  key: string
  label: string
  count: number
  sample_products: string[]
}

export interface StoreVitrinePublic extends StoreProfile {
  city_state: string
  whatsapp_link: string | null
  stats: { products_count: number; categories_count: number }
  featured_categories: FeaturedCategory[]
}

export const storeApi = {
  getVitrine: (slug = 'agro-raiz') =>
    apiFetch<StoreVitrinePublic>(`/store/vitrine?slug=${slug}`, {}, false),

  getProfile: () => apiFetch<StoreProfile>('/store/profile'),

  updateProfile: (data: Partial<StoreProfile> & { name: string }) =>
    apiFetch<StoreProfile>('/store/profile', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
}

// ─── WebSocket ────────────────────────────────────────────────────────────────

export function createWebSocket(storeId: string, token: string): WebSocket {
  const wsBase = API_BASE.replace('http', 'ws').replace('https', 'wss')
  const ws = new WebSocket(`${wsBase}/api/v1/ws/${storeId}?token=${token}`)
  return ws
}

// ─── Admin AI Assistant ───────────────────────────────────────────────────────

export interface AdminAiChatResponse {
  response_type: string
  message: string
  preview?: Record<string, unknown>
  candidates?: { index: number; id: string; nome: string; estoque: number }[]
  pending_action?: Record<string, unknown> | null
  history?: { role: string; content: string }[]
  order_id?: string
}

export const adminAiApi = {
  getHistory: () =>
    apiFetch<{ history: { role: string; content: string }[]; pending_action: unknown }>(
      '/admin-ai/history',
    ),

  chat: (message: string, selectionIndex?: number) =>
    apiFetch<AdminAiChatResponse>('/admin-ai/chat', {
      method: 'POST',
      body: JSON.stringify({ message, selection_index: selectionIndex }),
    }),

  confirm: () =>
    apiFetch<AdminAiChatResponse>('/admin-ai/confirm', { method: 'POST' }),

  cancel: () =>
    apiFetch<AdminAiChatResponse>('/admin-ai/cancel', { method: 'POST' }),

  reset: () =>
    apiFetch<AdminAiChatResponse>('/admin-ai/reset', { method: 'POST' }),

  select: (selectionIndex: number) =>
    apiFetch<AdminAiChatResponse>('/admin-ai/select', {
      method: 'POST',
      body: JSON.stringify({ selection_index: selectionIndex }),
    }),
}

// ─── Stock Monitoring ─────────────────────────────────────────────────────────

export const stockMonitoringApi = {
  getStats: () => apiFetch('/stock-monitoring/stats'),
  getRankings: () => apiFetch('/stock-monitoring/rankings'),
  getPending: () => apiFetch('/stock-monitoring/pending'),
  confirmProduct: (id: string, newStock?: number) =>
    apiFetch(`/stock-monitoring/confirm/${id}`, {
      method: 'POST',
      body: JSON.stringify({ new_stock: newStock }),
    }),
  confirmAll: () =>
    apiFetch('/stock-monitoring/confirm-all', { method: 'POST', body: JSON.stringify({}) }),
  generateReport: () =>
    apiFetch('/stock-monitoring/weekly-report/generate', { method: 'POST' }),
  getLatestReport: () =>
    apiFetch('/stock-monitoring/weekly-report/latest'),
  sendReportWhatsApp: () =>
    apiFetch('/stock-monitoring/weekly-report/send-whatsapp', { method: 'POST' }),
  getAuditLog: (days = 30) =>
    apiFetch(`/stock-monitoring/audit?days=${days}`),
}
