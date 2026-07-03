'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Bot, Send, Loader2, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet'
import { ScrollArea } from '@/components/ui/scroll-area'
import { adminAiApi } from '@/lib/api'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

const QUICK_SUGGESTIONS = [
  'Registrar reposição',
  'Registrar venda de balcão',
  'Registrar venda com entrega',
  'Consultar estoque',
  'Cadastrar produto',
  'Ver produtos com estoque baixo',
]

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
  const bottomRef = useRef<HTMLDivElement>(null)

  const loadHistory = useCallback(async () => {
    try {
      const data = await adminAiApi.getHistory()
      setMessages((data.history || []) as ChatMessage[])
      setPendingConfirm(!!data.pending_action)
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    if (open) loadHistory()
  }, [open, loadHistory])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

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
      const err = e instanceof Error ? e.message : 'Erro ao enviar mensagem'
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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col p-0 gap-0">
        <SheetHeader className="p-4 border-b shrink-0">
          <SheetTitle className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-primary" />
            Assistente de Gestão IA
          </SheetTitle>
          <SheetDescription>
            Descreva o que precisa em linguagem simples. Nada é alterado sem sua confirmação.
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 px-4">
          <div className="space-y-3 py-4">
            {messages.length === 0 && (
              <div className="text-sm text-muted-foreground space-y-3">
                <p>Olá! Posso ajudar com estoque, vendas e cadastro de produtos.</p>
                <div className="flex flex-wrap gap-2">
                  {QUICK_SUGGESTIONS.map(s => (
                    <Button
                      key={s}
                      variant="outline"
                      size="sm"
                      className="text-xs h-auto py-1.5"
                      onClick={() => sendMessage(s === 'Registrar reposição' ? 'Chegaram produtos no estoque' : s === 'Consultar estoque' ? 'Consultar estoque' : s)}
                      disabled={loading}
                    >
                      {s}
                    </Button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={cn(
                  'rounded-lg px-3 py-2 text-sm max-w-[90%] whitespace-pre-wrap',
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
            <div ref={bottomRef} />
          </div>
        </ScrollArea>

        {pendingConfirm && (
          <div className="px-4 py-2 border-t bg-warning/5 flex items-center gap-2 shrink-0">
            <Badge variant="outline" className="text-xs">Aguardando confirmação</Badge>
            <Button size="sm" className="gap-1" onClick={handleConfirm} disabled={loading}>
              <Check className="w-3 h-3" /> Confirmar
            </Button>
            <Button size="sm" variant="outline" className="gap-1" onClick={handleCancel} disabled={loading}>
              <X className="w-3 h-3" /> Cancelar
            </Button>
          </div>
        )}

        <div className="p-4 border-t flex gap-2 shrink-0">
          <Input
            placeholder="Ex: Chegaram 10 sacos de Golden Adulto 15kg"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage(input)}
            disabled={loading}
          />
          <Button size="icon" onClick={() => sendMessage(input)} disabled={loading || !input.trim()}>
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
