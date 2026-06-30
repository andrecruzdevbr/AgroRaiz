/**
 * AgroRaiz - Auth Store
 * JWT authentication state. Integrates with existing Zustand stores.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { authApi, setAccessToken, getAccessToken, type AuthUser } from './api'

interface AuthState {
  user: AuthUser | null
  accessToken: string | null
  refreshToken: string | null
  isAuthenticated: boolean
  isLoading: boolean

  login: (email: string, password: string) => Promise<void>
  logout: () => void
  refreshAccessToken: () => Promise<boolean>
  initialize: () => Promise<void>
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,

      login: async (email: string, password: string) => {
        set({ isLoading: true })
        try {
          const data = await authApi.login(email, password)
          setAccessToken(data.access_token)
          set({
            user: data.user,
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            isAuthenticated: true,
            isLoading: false,
          })
        } catch (error) {
          set({ isLoading: false })
          throw error
        }
      },

      logout: () => {
        setAccessToken(null)
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
          isLoading: false,
        })
      },

      refreshAccessToken: async () => {
        const { refreshToken } = get()
        if (!refreshToken) return false

        try {
          const data = await authApi.refresh(refreshToken)
          setAccessToken(data.access_token)
          set({ accessToken: data.access_token, isAuthenticated: true })
          return true
        } catch {
          get().logout()
          return false
        }
      },

      initialize: async () => {
        let token = getAccessToken()

        if (!token) {
          const refreshed = await get().refreshAccessToken()
          if (refreshed) token = getAccessToken()
        }

        if (!token) {
          set({ isAuthenticated: false, accessToken: null })
          return
        }

        try {
          const user = await authApi.me()
          set({ user, isAuthenticated: true, accessToken: token })
        } catch {
          const refreshed = await get().refreshAccessToken()
          if (!refreshed) {
            get().logout()
            return
          }
          try {
            const user = await authApi.me()
            set({ user, isAuthenticated: true, accessToken: getAccessToken() })
          } catch {
            get().logout()
          }
        }
      },
    }),
    {
      name: 'agroraiz-auth',
      partialize: (state) => ({
        refreshToken: state.refreshToken,
        user: state.user,
      }),
    },
  ),
)

// Permission helper
export function hasRole(user: AuthUser | null, ...roles: string[]): boolean {
  if (!user) return false
  return roles.includes(user.role)
}
