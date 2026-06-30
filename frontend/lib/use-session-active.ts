'use client'

import { useLayoutEffect, useState } from 'react'
import { getAccessToken } from './api'
import { useAuthStore } from './auth-store'

function readSessionActive(): boolean {
  return !!getAccessToken()
}

/**
 * Hydration-safe session flag for public UI.
 * Cookie is the source of truth; re-syncs on every auth store change (login/logout).
 */
export function useSessionActive() {
  const [hydrated, setHydrated] = useState(false)
  const [active, setActive] = useState(false)

  useLayoutEffect(() => {
    const sync = () => setActive(readSessionActive())
    sync()
    setHydrated(true)
    const unsub = useAuthStore.subscribe(sync)
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) sync()
    }
    window.addEventListener('pageshow', onPageShow)
    return () => {
      unsub()
      window.removeEventListener('pageshow', onPageShow)
    }
  }, [])

  return { hydrated, active }
}
