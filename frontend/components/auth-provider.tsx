'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { useAuthStore } from '@/lib/auth-store'
import { getAccessToken } from '@/lib/api'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const initialize = useAuthStore((s) => s.initialize)
  const pathname = usePathname()

  useEffect(() => {
    initialize()
  }, [initialize])

  useEffect(() => {
    const token = getAccessToken()
    const { isAuthenticated, logout } = useAuthStore.getState()
    if (!token && isAuthenticated) {
      logout()
    }
  }, [pathname])

  return <>{children}</>
}
