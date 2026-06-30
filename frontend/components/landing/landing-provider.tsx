'use client'

import { createContext, useContext } from 'react'
import type { StoreVitrinePublic } from '@/lib/api'

const LandingContext = createContext<StoreVitrinePublic | null>(null)

export function LandingProvider({
  data,
  children,
}: {
  data: StoreVitrinePublic
  children: React.ReactNode
}) {
  return (
    <LandingContext.Provider value={data}>
      {children}
    </LandingContext.Provider>
  )
}

export function useLandingStore(): StoreVitrinePublic {
  const ctx = useContext(LandingContext)
  if (!ctx) {
    throw new Error('useLandingStore must be used within LandingProvider')
  }
  return ctx
}
