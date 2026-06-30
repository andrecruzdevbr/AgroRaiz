'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Plus, Megaphone, Play, Pause, Users, BarChart2, Send } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { campaignsApi } from '@/lib/api'
import { cn } from '@/lib/utils'

const STATUS_CONFIG = {
  rascunho: { label: 'Rascunho', color: 'bg-muted text-muted-foreground' },
  agendada: { label: 'Agendada', color: 'bg-info/10 text-info' },
  ativa: { label: 'Ativa', color: 'bg-success/10 text-success' },
  pausada: { label: 'Pausada', color: 'bg-warning/10 text-warning' },
  finalizada: { label: 'Finalizada', color: 'bg-muted text-muted-foreground' },
}

const fadeInUp = { initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 } }

export function CampanhasContent() {
  const [campaigns, setCampaigns] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ nome: '', mensagem: '', tipo: 'promocao' })

  useEffect(() => { fetchCampaigns() }, [])

  const fetchCampaigns = async () => {
    setLoading(true)
    try {
      const data = await campaignsApi.list() as any
      setCampaigns(data.campaigns || [])
    } catch { toast.error('Erro ao carregar campanhas') }
    finally { setLoading(false) }
  }

  const handleCreate = async () => {
    try {
      await campaignsApi.create(form)
      toast.success('Campanha criada!')
      setShowCreate(false)
      setForm({ nome: '', mensagem: '', tipo: 'promocao' })
      fetchCampaigns()
    } catch { toast.error('Erro ao criar campanha') }
  }

  const handleLaunch = async (id: string) => {
    try {
      const result = await campaignsApi.launch(id) as any
      toast.success(`Campanha disparada para ${result.recipients_queued} destinatários!`)
      fetchCampaigns()
    } catch (e: any) { toast.error(e.message || 'Erro ao lançar campanha') }
  }

  return (
    <div className="space-y-6">
      <motion.div {...fadeInUp} className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold">Campanhas</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Marketing via WhatsApp e Instagram
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="gap-2">
          <Plus className="w-4 h-4" /> Nova Campanha
        </Button>
      </motion.div>

      <div className="grid gap-4">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-32 bg-muted animate-pulse rounded-xl" />
          ))
        ) : campaigns.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center py-16 text-muted-foreground">
              <Megaphone className="w-10 h-10 mb-3 opacity-30" />
              <p className="font-medium">Nenhuma campanha ainda</p>
              <p className="text-sm">Crie sua primeira campanha de marketing</p>
            </CardContent>
          </Card>
        ) : campaigns.map((c, i) => {
          const status = STATUS_CONFIG[c.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.rascunho
          const metricas = c.metricas || {}
          return (
            <motion.div
              key={c.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Card>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold truncate">{c.nome}</h3>
                        <Badge className={cn('text-xs', status.color)}>{status.label}</Badge>
                        <Badge variant="outline" className="text-xs capitalize">{c.tipo}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{c.mensagem}</p>

                      {/* Metrics */}
                      {metricas.enviados > 0 && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>Abertura: {metricas.taxa_abertura}%</span>
                            <span>{metricas.lidos}/{metricas.enviados} lidos</span>
                          </div>
                          <Progress value={metricas.taxa_abertura} className="h-1.5" />
                        </div>
                      )}

                      <div className="flex gap-4 mt-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3" /> {metricas.total_destinatarios || 0} destinatários
                        </span>
                        <span className="flex items-center gap-1">
                          <Send className="w-3 h-3" /> {metricas.enviados || 0} enviados
                        </span>
                        {metricas.conversoes > 0 && (
                          <span className="flex items-center gap-1 text-success">
                            <BarChart2 className="w-3 h-3" /> {metricas.conversoes} conversões
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-2 shrink-0">
                      {['rascunho', 'agendada'].includes(c.status) && (
                        <Button size="sm" onClick={() => handleLaunch(c.id)} className="gap-1">
                          <Play className="w-3.5 h-3.5" /> Lançar
                        </Button>
                      )}
                      {c.status === 'ativa' && (
                        <Button size="sm" variant="outline" onClick={() => campaignsApi.update(c.id, { status: 'pausada' }).then(fetchCampaigns)} className="gap-1">
                          <Pause className="w-3.5 h-3.5" /> Pausar
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )
        })}
      </div>

      {/* Create dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nova Campanha</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Nome da campanha</Label>
              <Input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="Ex: Promoção de Inverno" />
            </div>
            <div className="space-y-1">
              <Label>Tipo</Label>
              <Select value={form.tipo} onValueChange={v => setForm(f => ({ ...f, tipo: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="promocao">Promoção</SelectItem>
                  <SelectItem value="reengajamento">Reengajamento</SelectItem>
                  <SelectItem value="novidades">Novidades</SelectItem>
                  <SelectItem value="sazonal">Sazonal</SelectItem>
                  <SelectItem value="aniversario">Aniversário</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Mensagem WhatsApp</Label>
              <Textarea
                value={form.mensagem}
                onChange={e => setForm(f => ({ ...f, mensagem: e.target.value }))}
                placeholder="Olá! Temos uma promoção especial para você..."
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={!form.nome || !form.mensagem}>Criar campanha</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
