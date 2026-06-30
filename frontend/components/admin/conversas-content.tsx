'use client'

import { useState, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Search, MessageSquare, Bot, Send, AlertTriangle } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useConversations, useConversationMessages, useSendMessage, useResumeAutomation, KEYS } from '@/lib/hooks'
import { useRealtime } from '@/hooks/use-realtime'
import { useQueryClient } from '@tanstack/react-query'

const STATUS_CONFIG = {
  ia: { label: 'IA Atendendo', color: 'bg-primary/10 text-primary' },
  aguardando_humano: { label: 'Aguardando Humano', color: 'bg-destructive/10 text-destructive' },
  humano: { label: 'Atendente Humano', color: 'bg-info/10 text-info' },
  finalizada: { label: 'Finalizada', color: 'bg-muted text-muted-foreground' },
} as const

export function ConversasContent() {
  const qc = useQueryClient()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('todos')
  const [novaMensagem, setNovaMensagem] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const { data: conversasData, isLoading } = useConversations({
    status: filtroStatus !== 'todos' ? filtroStatus : undefined,
  })
  const conversas = conversasData?.conversations ?? []
  const selectedConv = conversas.find((c: any) => c.id === selectedId) ?? null

  const { data: messagesData, isLoading: loadingMessages } = useConversationMessages(selectedId ?? '')
  const messages = messagesData?.messages ?? []

  const sendMsg = useSendMessage()
  const resumeAI = useResumeAutomation()

  useRealtime({
    new_message: (data: any) => {
      qc.invalidateQueries({ queryKey: ['conversations'] })
      if (data.conversation_id === selectedId) {
        qc.invalidateQueries({ queryKey: KEYS.conversationMessages(selectedId!) })
      }
    },
    human_takeover: () => qc.invalidateQueries({ queryKey: ['conversations'] }),
  })

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const filtered = conversas
    .filter((c: any) => !busca ||
      c.cliente?.nome?.toLowerCase().includes(busca.toLowerCase()) ||
      c.cliente?.telefone?.includes(busca))
    .sort((a: any, b: any) => {
      if (a.status === 'aguardando_humano' && b.status !== 'aguardando_humano') return -1
      if (b.status === 'aguardando_humano' && a.status !== 'aguardando_humano') return 1
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    })

  const stats = {
    total: conversas.length,
    ia: conversas.filter((c: any) => c.status === 'ia').length,
    aguardando: conversas.filter((c: any) => c.status === 'aguardando_humano').length,
    humano: conversas.filter((c: any) => c.status === 'humano').length,
  }

  return (
    <div className="space-y-4">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl lg:text-3xl font-bold">Central de Atendimento</h1>
        <p className="text-muted-foreground text-sm mt-0.5">WhatsApp e Instagram em tempo real</p>
      </motion.div>

      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Total', value: stats.total, color: '' },
          { label: 'IA Ativa', value: stats.ia, color: 'text-primary' },
          { label: 'Aguardando', value: stats.aguardando, color: 'text-destructive' },
          { label: 'Humano', value: stats.humano, color: 'text-info' },
        ].map(({ label, value, color }) => (
          <Card key={label}>
            <CardContent className="p-3 text-center">
              <p className={cn('text-2xl font-bold', color)}>{value}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex h-[calc(100vh-20rem)] gap-4 overflow-hidden">
        <Card className="w-72 shrink-0 flex flex-col overflow-hidden">
          <div className="p-3 border-b space-y-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
              <Input placeholder="Buscar..." value={busca} onChange={e => setBusca(e.target.value)} className="pl-8 h-8 text-sm" />
            </div>
            <Select value={filtroStatus} onValueChange={setFiltroStatus}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="ia">IA Atendendo</SelectItem>
                <SelectItem value="aguardando_humano">Aguardando Humano</SelectItem>
                <SelectItem value="humano">Com Humano</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <ScrollArea className="flex-1">
            {isLoading ? Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="p-3 border-b"><Skeleton className="h-12 w-full" /></div>
            )) : filtered.length === 0 ? (
              <div className="flex flex-col items-center py-12 text-muted-foreground">
                <MessageSquare className="h-8 w-8 mb-2 opacity-30" />
                <p className="text-sm">Nenhuma conversa</p>
              </div>
            ) : filtered.map((conv: any) => {
              const cfg = STATUS_CONFIG[conv.status as keyof typeof STATUS_CONFIG]
              const initials = conv.cliente?.nome?.split(' ').map((n: string) => n[0]).join('').slice(0, 2) ?? '?'
              return (
                <button key={conv.id} onClick={() => setSelectedId(conv.id)}
                  className={cn('w-full flex items-start gap-3 px-3 py-3 text-left transition-colors hover:bg-muted/50 border-l-2',
                    conv.status === 'aguardando_humano' ? 'border-l-destructive' : 'border-l-transparent',
                    selectedId === conv.id && 'bg-muted border-l-primary'
                  )}>
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarFallback className="text-xs bg-primary/10 text-primary">{initials}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{conv.cliente?.nome || conv.cliente?.telefone || 'Cliente'}</p>
                    <Badge className={cn('text-[10px] px-1.5 py-0 mt-0.5', cfg?.color)}>{cfg?.label}</Badge>
                  </div>
                </button>
              )
            })}
          </ScrollArea>
        </Card>

        {selectedConv ? (
          <Card className="flex-1 flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-primary/10 text-primary text-xs">
                    {selectedConv.cliente?.nome?.split(' ').map((n: string) => n[0]).join('').slice(0, 2) ?? '?'}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-semibold">{selectedConv.cliente?.nome || 'Cliente'}</p>
                  <p className="text-xs text-muted-foreground">{selectedConv.cliente?.telefone}</p>
                </div>
              </div>
              {selectedConv.status !== 'ia' && selectedConv.cliente?.telefone && (
                <Button variant="outline" size="sm" onClick={() => resumeAI.mutate(selectedConv.cliente!.telefone!)} className="gap-1.5 text-xs">
                  <Bot className="h-3.5 w-3.5" /> Reativar IA
                </Button>
              )}
            </div>
            <ScrollArea className="flex-1 p-4">
              {loadingMessages ? (
                <div className="flex justify-center py-8"><div className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full" /></div>
              ) : messages.map((msg: any) => {
                const isOut = msg.remetente !== 'cliente'
                return (
                  <div key={msg.id} className={cn('flex gap-2 mb-3', isOut && 'flex-row-reverse')}>
                    <div className={cn('px-3 py-2 rounded-2xl text-sm max-w-[70%]',
                      isOut ? 'bg-primary text-primary-foreground rounded-tr-sm' : 'bg-muted rounded-tl-sm'
                    )}>
                      {msg.conteudo}
                    </div>
                  </div>
                )
              })}
              <div ref={messagesEndRef} />
            </ScrollArea>
            <div className="px-4 py-3 border-t">
              {selectedConv.status !== 'ia' ? (
                <div className="flex gap-2">
                  <Input placeholder="Digite..." value={novaMensagem} onChange={e => setNovaMensagem(e.target.value)}
                    onKeyDown={e => {
                      const phone = selectedConv.cliente?.telefone
                      if (e.key === 'Enter' && !e.shiftKey && phone) sendMsg.mutate({ phone, message: novaMensagem })
                    }}
                    className="flex-1" />
                  <Button size="icon" onClick={() => {
                      const phone = selectedConv.cliente?.telefone
                      if (!phone) return
                      sendMsg.mutate({ phone, message: novaMensagem }); setNovaMensagem('')
                    }}
                    disabled={!novaMensagem.trim() || !selectedConv.cliente?.telefone || sendMsg.isPending}>
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-lg px-4 py-3">
                  <Bot className="h-4 w-4 text-primary shrink-0" />
                  <span>A IA está respondendo este cliente automaticamente.</span>
                </div>
              )}
            </div>
          </Card>
        ) : (
          <Card className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-20" />
              <p className="font-medium">Selecione uma conversa</p>
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}
