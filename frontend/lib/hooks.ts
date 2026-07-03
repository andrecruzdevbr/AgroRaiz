/**
 * AgroRaiz - React Query Hooks
 * Typed, cached data fetching for all API endpoints.
 * Replace direct API calls in components with these hooks.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  dashboardApi, customersApi, productsApi, categoriesApi,
  conversationsApi, whatsappApi, campaignsApi, aiApi,
  storeApi,
  apiFetch,
} from './api'

// ─── Keys ─────────────────────────────────────────────────────────────────────
export const KEYS = {
  dashboard: (period: string) => ['dashboard', period],
  dashboardActivity: () => ['dashboard', 'activity'],
  customers: (params: object) => ['customers', params],
  customer: (id: string) => ['customer', id],
  customerInteractions: (id: string) => ['customer', id, 'interactions'],
  products: (params: object) => ['products', params],
  productSummary: () => ['products', 'summary'],
  productLowStock: () => ['products', 'low-stock'],
  categories: (includeInactive?: boolean) => ['categories', includeInactive],
  conversations: (params: object) => ['conversations', params],
  conversationMessages: (id: string) => ['conversation', id, 'messages'],
  campaigns: () => ['campaigns'],
  whatsappStatus: () => ['whatsapp', 'status'],
  humanQueue: () => ['whatsapp', 'human-queue'],
  aiMetrics: (period: string) => ['ai', 'metrics', period],
  aiPersona: () => ['ai', 'persona'],
  storeProfile: () => ['store', 'profile'],
  storeVitrine: (slug: string) => ['store', 'vitrine', slug],
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
export function useDashboardMetrics(period: '7d' | '30d' | '90d' = '30d') {
  return useQuery({
    queryKey: KEYS.dashboard(period),
    queryFn: () => dashboardApi.getMetrics(period),
    refetchInterval: 60_000, // Auto-refresh every minute
  })
}

export function useDashboardActivity() {
  return useQuery({
    queryKey: KEYS.dashboardActivity(),
    queryFn: () => dashboardApi.getActivity(),
    refetchInterval: 30_000,
  })
}

// ─── Customers ────────────────────────────────────────────────────────────────
export function useCustomers(params: Parameters<typeof customersApi.list>[0] = {}) {
  return useQuery({
    queryKey: KEYS.customers(params),
    queryFn: () => customersApi.list(params),
  })
}

export function useCustomer(id: string) {
  return useQuery({
    queryKey: KEYS.customer(id),
    queryFn: () => customersApi.get(id),
    enabled: !!id,
  })
}

export function useCustomerInteractions(id: string) {
  return useQuery({
    queryKey: KEYS.customerInteractions(id),
    queryFn: () => customersApi.getInteractions(id),
    enabled: !!id,
  })
}

export function useCreateCustomer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: customersApi.create,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }),
  })
}

export function useUpdateCustomer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      customersApi.update(id, data),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['customers'] })
      qc.invalidateQueries({ queryKey: KEYS.customer(id) })
    },
  })
}

// ─── Products ─────────────────────────────────────────────────────────────────
export function useProducts(params: Parameters<typeof productsApi.list>[0] = {}) {
  return useQuery({
    queryKey: KEYS.products(params),
    queryFn: () => productsApi.list(params),
  })
}

export function useLowStockProducts() {
  return useQuery({
    queryKey: KEYS.productLowStock(),
    queryFn: () => productsApi.getLowStock(),
    refetchInterval: 120_000,
  })
}

export function useCreateProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: productsApi.create,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  })
}

export function useUpdateProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      productsApi.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  })
}

export function useProductsSummary() {
  return useQuery({
    queryKey: KEYS.productSummary(),
    queryFn: () => productsApi.getSummary(),
    refetchInterval: 120_000,
  })
}

export function useAdjustStock() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id, quantity, operation, motivo,
    }: {
      id: string
      quantity: number
      operation: 'adicionar' | 'remover' | 'corrigir'
      motivo: string
    }) => productsApi.updateStock(id, quantity, operation, motivo),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] })
    },
  })
}

// ─── Categories ───────────────────────────────────────────────────────────────
export function useCategories(includeInactive = true) {
  return useQuery({
    queryKey: KEYS.categories(includeInactive),
    queryFn: async () => {
      const data = await categoriesApi.list(includeInactive)
      return data.categories
    },
  })
}

export function useCreateCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => categoriesApi.create(name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }),
  })
}

export function useUpdateCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: { name?: string; active?: boolean } }) =>
      categoriesApi.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }),
  })
}

// ─── Conversations ────────────────────────────────────────────────────────────
export function useConversations(params: Parameters<typeof conversationsApi.list>[0] = {}) {
  return useQuery({
    queryKey: KEYS.conversations(params),
    queryFn: () => conversationsApi.list(params),
    refetchInterval: 15_000,
  })
}

export function useConversationMessages(id: string) {
  return useQuery({
    queryKey: KEYS.conversationMessages(id),
    queryFn: () => conversationsApi.getMessages(id),
    enabled: !!id,
    refetchInterval: 5_000, // Poll messages every 5s when open
  })
}

// ─── WhatsApp ─────────────────────────────────────────────────────────────────
export function useWhatsAppStatus() {
  return useQuery({
    queryKey: KEYS.whatsappStatus(),
    queryFn: () => whatsappApi.getStatus(),
    refetchInterval: 30_000,
  })
}

export function useHumanQueue() {
  return useQuery({
    queryKey: KEYS.humanQueue(),
    queryFn: () => whatsappApi.getHumanQueue(),
    refetchInterval: 10_000,
  })
}

export function useSendMessage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ phone, message }: { phone: string; message: string }) =>
      whatsappApi.sendMessage(phone, message),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['conversations'] }),
  })
}

export function useResumeAutomation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (phone: string) => whatsappApi.resumeAutomation(phone),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['conversations'] })
      qc.invalidateQueries({ queryKey: KEYS.humanQueue() })
    },
  })
}

// ─── Campaigns ────────────────────────────────────────────────────────────────
export function useCampaigns() {
  return useQuery({
    queryKey: KEYS.campaigns(),
    queryFn: () => campaignsApi.list(),
  })
}

export function useCreateCampaign() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: campaignsApi.create,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.campaigns() }),
  })
}

export function useLaunchCampaign() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => campaignsApi.launch(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.campaigns() }),
  })
}

// ─── AI ───────────────────────────────────────────────────────────────────────
export function useAIMetrics(period: string = '30d') {
  return useQuery({
    queryKey: KEYS.aiMetrics(period),
    queryFn: () => aiApi.getMetrics(),
    staleTime: 5 * 60_000,
  })
}

export function useGenerateContent() {
  return useMutation({
    mutationFn: ({ type, topic, season }: { type: string; topic?: string; season?: string }) =>
      aiApi.generateContent(type, topic, season),
  })
}

// ─── Store profile ────────────────────────────────────────────────────────────
export function useStoreProfile() {
  return useQuery({
    queryKey: KEYS.storeProfile(),
    queryFn: () => storeApi.getProfile(),
  })
}

export function useUpdateStoreProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: storeApi.updateProfile,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['store'] })
    },
  })
}

export function useStoreVitrine(slug = 'agro-raiz') {
  return useQuery({
    queryKey: KEYS.storeVitrine(slug),
    queryFn: () => storeApi.getVitrine(slug),
    staleTime: 60_000,
  })
}

// ─── System Health ────────────────────────────────────────────────────────────
export function useSystemHealth() {
  return useQuery({
    queryKey: ['system', 'health'],
    queryFn: () => apiFetch('/dashboard/system/health') as Promise<{
      ai: { provider: string; model: string; healthy: boolean; key_set: boolean }
      whatsapp: { state: string; healthy: boolean; instance: string }
      instagram: { configured: boolean; healthy: boolean }
      database: { healthy: boolean }
      redis: { healthy: boolean }
      last_ai_error: string | null
    }>,
    refetchInterval: 60_000,
  })
}
