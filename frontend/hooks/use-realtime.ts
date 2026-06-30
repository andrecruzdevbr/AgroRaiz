/**
 * AgroRaiz - useRealtime Hook
 * WebSocket connection for live dashboard updates.
 * Preserves existing component interfaces.
 */
'use client'

import { useEffect, useRef, useCallback } from 'react'
import { useAuthStore } from '@/lib/auth-store'
import { createWebSocket } from '@/lib/api'
import { toast } from 'sonner'

interface RealtimeEvent {
  event: string
  data: Record<string, unknown>
}

type EventHandler = (data: Record<string, unknown>) => void

export function useRealtime(handlers: Record<string, EventHandler> = {}) {
  const ws = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<NodeJS.Timeout | undefined>(undefined)
  const { user, accessToken } = useAuthStore()

  const connect = useCallback(() => {
    if (!user?.store_id || !accessToken) return
    if (ws.current?.readyState === WebSocket.OPEN) return

    try {
      ws.current = createWebSocket(user.store_id, accessToken)

      ws.current.onopen = () => {
        console.log('[WS] Connected')
        // Heartbeat ping every 30s
        const ping = setInterval(() => {
          if (ws.current?.readyState === WebSocket.OPEN) {
            ws.current.send('ping')
          } else {
            clearInterval(ping)
          }
        }, 30000)
      }

      ws.current.onmessage = (event) => {
        try {
          const { event: name, data }: RealtimeEvent = JSON.parse(event.data)
          if (name === 'pong') return

          // Call registered handler
          const handler = handlers[name]
          if (handler) handler(data)

          // Default toast for human takeover
          if (name === 'human_takeover') {
            toast.warning('Atendimento humano necessário', {
              description: `Cliente ${data.phone} precisa de atenção`,
              action: { label: 'Ver', onClick: () => window.location.href = '/admin/conversas' },
            })
          }
        } catch (e) {
          // ignore parse errors
        }
      }

      ws.current.onclose = () => {
        console.log('[WS] Disconnected, reconnecting in 5s...')
        reconnectTimer.current = setTimeout(connect, 5000)
      }

      ws.current.onerror = () => {
        ws.current?.close()
      }
    } catch (e) {
      reconnectTimer.current = setTimeout(connect, 5000)
    }
  }, [user?.store_id, accessToken])

  useEffect(() => {
    connect()
    return () => {
      clearTimeout(reconnectTimer.current)
      ws.current?.close()
    }
  }, [connect])

  return {
    isConnected: ws.current?.readyState === WebSocket.OPEN,
  }
}
