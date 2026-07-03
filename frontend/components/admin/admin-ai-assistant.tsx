'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Bot, Send, Loader2, Check, X, MessageSquarePlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet'
import { adminAiApi } from '@/lib/api'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

const QUICK_SUGGESTIONS = [
  { label: 'Registrar reposição', message: 'Chegaram produtos no estoque' },
  { label: 'Registrar venda de balcão', message: 'Registrar venda de balcão' },
  { label: 'Registrar venda com entrega', message: 'Registrar venda com entrega' },
  { label: 'Consultar estoque', message: 'Consultar estoque' },
  { label: 'Ver estoque baixo', message: 'Ver produtos com estoque baixo' },
]

const WELCOME_TEXT =
  'Olá! Posso ajudar com estoque, vendas e cadastro de produtos. Descreva o que precisa ou use uma sugestão abaixo.'

interface AdminAiAssistantProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onActionComplete?: () => void
}

export function AdminAiAssistant({ open, onOpenChange, onActionComplete }: AdminAiAssistantProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [pendingConfirm, setPendingConfirm] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const syncPendingState = useCallback(async () => {
    try {
      const data = await adminAiApi.getHistory()
      setPendingConfirm(!!data.pending_action)
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    if (open) syncPendingState()
  }, [open, syncPendingState])

  useEffect(() => {
    if (open) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, loading, open, pendingConfirm])

  const sendMessage = async (text: string) => {
    const msg = text.trim()
    if (!msg || loading) return
    setInput('')
    setLoading(true)
    setMessages(prev => [...prev, { role: 'user', content: msg }])
    try {
      const data = await adminAiApi.chat(msg)
      setMessages(prev => [...prev, { role: 'assistant', content: data.message }])
      setPendingConfirm(data.response_type === 'confirm_required')
      if (data.response_type === 'executed') {
        onActionComplete?.()
      }
    } catch (e: unknown) {
      const err = e instanceof Error ? e.message : 'Não foi possível enviar a mensagem.'
      toast.error(err)
      setMessages(prev => [...prev, { role: 'assistant', content: err }])
    } finally {
      setLoading(false)
    }
  }

  const handleConfirm = async () => {
    setLoading(true)
    try {
      const data = await adminAiApi.confirm()
      setMessages(prev => [...prev, { role: 'assistant', content: data.message }])
      setPendingConfirm(false)
      onActionComplete?.()
      toast.success('Alteração confirmada')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao confirmar')
    } finally {
      setLoading(false)
    }
  }

  const handleCancel = async () => {
    setLoading(true)
    try {
      const data = await adminAiApi.cancel()
      setMessages(prev => [...prev, { role: 'assistant', content: data.message }])
      setPendingConfirm(false)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao cancelar')
    } finally {
      setLoading(false)
    }
  }

  const handleNewConversation = async () => {
    setLoading(true)
    try {
      await adminAiApi.reset()
      setMessages([])
      setInput('')
      setPendingConfirm(false)
      toast.success('Nova conversa iniciada')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao iniciar nova conversa')
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  const showWelcome = messages.length === 0

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-lg flex flex-col gap-0 p-0 h-full max-h-[100dvh] overflow-hidden"
      >
        <SheetHeader className="p-4 pr-12 border-b shrink-0 space-y-1">
          <div className="flex items-start justify-between gap-2">
            <SheetTitle className="flex items-center gap-2">
              <Bot className="w-5 h-5 text-primary shrink-0" />
              Assistente de Gestão IA
            </SheetTitle>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0 gap-1 text-xs h-8"
              onClick={handleNewConversation}
              disabled={loading}
            >
              <MessageSquarePlus className="w-3.5 h-3.5" />
              Nova conversa
            </Button>
          </div>
          <SheetDescription>
            Descreva o que precisa em linguagem simples. Nada é alterado sem sua confirmação.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4">
          <div className="space-y-3 py-4">
            {showWelcome && (
              <div className="text-sm text-muted-foreground space-y-3">
                <p>{WELCOME_TEXT}</p>
                <div className="flex flex-wrap gap-2">
                  {QUICK_SUGGESTIONS.map(s => (
                    <Button
                      key={s.label}
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-xs h-auto py-1.5"
                      onClick={() => sendMessage(s.message)}
                      disabled={loading}
                    >
                      {s.label}
                    </Button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={cn(
                  'rounded-lg px-3 py-2 text-sm max-w-[90%] whitespace-pre-wrap break-words',
                  m.role === 'user'
                    ? 'ml-auto bg-primary text-primary-foreground'
                    : 'bg-muted',
                )}
              >
                {m.content}
              </div>
            ))}
            {loading && (
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Loader2 className="w-4 h-4 animate-spin" /> Pensando...
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {pendingConfirm && (
          <div className="px-4 py-2 border-t bg-warning/5 flex flex-wrap items-center gap-2 shrink-0">
            <Badge variant="outline" className="text-xs">Aguardando confirmação</Badge>
            <Button type="button" size="sm" className="gap-1" onClick={handleConfirm} disabled={loading}>
              <Check className="w-3 h-3" /> Confirmar
            </Button>
            <Button type="button" size="sm" variant="outline" className="gap-1" onClick={handleCancel} disabled={loading}>
              <X className="w-3 h-3" /> Cancelar
            </Button>
          </div>
        )}

        <div className="p-4 border-t bg-background shrink-0 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="flex gap-2 items-end">
            <Textarea
              placeholder="Digite uma mensagem para a Assistente IA..."
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading}
              rows={1}
              className="min-h-[44px] max-h-32 resize-none flex-1"
            />
            <Button
              type="button"
              size="icon"
              className="shrink-0 h-11 w-11"
              onClick={() => sendMessage(input)}
              disabled={loading || !input.trim()}
              aria-label="Enviar mensagem"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
