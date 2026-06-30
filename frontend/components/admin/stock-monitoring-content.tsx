'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  CheckCircle, AlertTriangle, XCircle, Clock, RefreshCw,
  BarChart2, TrendingUp, Shield, FileText, Send, ChevronDown
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'
import { cn } from '@/lib/utils'

const formatDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—'

const formatDays = (n: number) =>
  n >= 999 ? 'Nunca confirmado' : n === 0 ? 'Hoje' : `${n} dias atrás`

function ConfirmationBadge({ dias }: { dias: number }) {
  if (dias >= 999 || dias > 30)
    return <Badge className="bg-destructive/10 text-destructive text-xs">Crítico</Badge>
  if (dias > 7)
    return <Badge className="bg-warning/10 text-warning text-xs">Alerta</Badge>
  return <Badge className="bg-success/10 text-success text-xs">OK</Badge>
}

export function StockMonitoringContent() {
  const qc = useQueryClient()
  const [confirmingAll, setConfirmingAll] = useState(false)

  const { data: stats, isLoading: loadingStats } = useQuery({
    queryKey: ['stock-monitoring', 'stats'],
    queryFn: () => apiFetch('/stock-monitoring/stats') as Promise<any>,
    refetchInterval: 60_000,
  })

  const { data: pending, isLoading: loadingPending } = useQuery({
    queryKey: ['stock-monitoring', 'pending'],
    queryFn: () => apiFetch('/stock-monitoring/pending') as Promise<any>,
  })

  const { data: rankings, isLoading: loadingRankings } = useQuery({
    queryKey: ['stock-monitoring', 'rankings'],
    queryFn: () => apiFetch('/stock-monitoring/rankings') as Promise<any>,
  })

  const { data: latestReport } = useQuery({
    queryKey: ['stock-monitoring', 'report'],
    queryFn: async () => {
      try {
        return await apiFetch('/stock-monitoring/weekly-report/latest') as Promise<any>
      } catch {
        return null  // No report yet — not an error
      }
    },
    retry: false,
  })

  const { data: auditLogs } = useQuery({
    queryKey: ['stock-monitoring', 'audit'],
    queryFn: () => apiFetch('/stock-monitoring/audit?days=30') as Promise<any>,
  })

  const confirmAll = useMutation({
    mutationFn: () => apiFetch('/stock-monitoring/confirm-all', { method: 'POST', body: JSON.stringify({}) }),
    onSuccess: (data: any) => {
      toast.success(`✅ ${data.confirmed_count} produtos confirmados!`)
      qc.invalidateQueries({ queryKey: ['stock-monitoring'] })
    },
    onError: () => toast.error('Erro ao confirmar produtos'),
  })

  const sendReport = useMutation({
    mutationFn: () => apiFetch('/stock-monitoring/weekly-report/send-whatsapp', { method: 'POST' }),
    onSuccess: () => toast.success('Resumo enviado para o WhatsApp!'),
    onError: () => toast.error('Erro ao enviar resumo'),
  })

  const generateReport = useMutation({
    mutationFn: () => apiFetch('/stock-monitoring/weekly-report/generate', { method: 'POST' }),
    onSuccess: () => {
      toast.success('Relatório gerado!')
      qc.invalidateQueries({ queryKey: ['stock-monitoring', 'report'] })
    },
  })

  const totalPending = (pending?.critical?.length ?? 0) + (pending?.warning?.length ?? 0)
  const totalProducts = totalPending + (pending?.ok_count ?? 0)
  const healthPct = totalProducts > 0
    ? Math.round(((pending?.ok_count ?? 0) / totalProducts) * 100)
    : 100

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold">Estoque Inteligente</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Monitoramento contínuo com confirmação via IA
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => sendReport.mutate()} disabled={sendReport.isPending} className="gap-2">
            <Send className="w-4 h-4" />
            Enviar resumo WhatsApp
          </Button>
          <Button onClick={() => confirmAll.mutate()} disabled={confirmAll.isPending} className="gap-2">
            <CheckCircle className="w-4 h-4" />
            Confirmar todos
          </Button>
        </div>
      </motion.div>

      {/* Summary cards */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
        className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: 'Saúde do catálogo',
            value: loadingStats ? '—' : `${healthPct}%`,
            sub: `${pending?.ok_count ?? 0} produtos OK`,
            color: healthPct >= 80 ? 'text-success' : healthPct >= 50 ? 'text-warning' : 'text-destructive',
            icon: Shield,
          },
          {
            label: 'Críticos (>30 dias)',
            value: loadingPending ? '—' : String(pending?.critical?.length ?? 0),
            sub: 'Sem confirmação',
            color: (pending?.critical?.length ?? 0) > 0 ? 'text-destructive' : 'text-success',
            icon: XCircle,
          },
          {
            label: 'Em alerta (7-30 dias)',
            value: loadingPending ? '—' : String(pending?.warning?.length ?? 0),
            sub: 'Confirmação pendente',
            color: (pending?.warning?.length ?? 0) > 0 ? 'text-warning' : 'text-success',
            icon: AlertTriangle,
          },
          {
            label: 'Última confirmação',
            value: stats?.ultima_atualizacao ? formatDate(stats.ultima_atualizacao) : '—',
            sub: stats?.ultima_confirmacao_por ?? 'Nenhuma',
            color: 'text-foreground',
            icon: Clock,
          },
        ].map(({ label, value, sub, color, icon: Icon }) => (
          <Card key={label}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Icon className={cn('w-4 h-4', color)} />
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
              <p className={cn('text-2xl font-bold', color)}>{value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
            </CardContent>
          </Card>
        ))}
      </motion.div>

      {/* Health progress */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium">Produtos com confirmação recente</p>
            <span className="text-sm font-bold">{healthPct}%</span>
          </div>
          <Progress value={healthPct} className="h-2 mb-2" />
          <p className="text-xs text-muted-foreground">
            {pending?.ok_count ?? 0} confirmados · {totalPending} pendentes de verificação
          </p>
        </CardContent>
      </Card>

      <Tabs defaultValue="pendentes">
        <TabsList>
          <TabsTrigger value="pendentes" className="gap-1.5">
            Pendentes
            {totalPending > 0 && (
              <Badge className="h-4 min-w-4 px-1 text-[10px] bg-destructive text-destructive-foreground">
                {totalPending}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="rankings">Rankings</TabsTrigger>
          <TabsTrigger value="relatorio">Relatório Semanal</TabsTrigger>
          <TabsTrigger value="auditoria">Auditoria</TabsTrigger>
        </TabsList>

        {/* Pending confirmation */}
        <TabsContent value="pendentes" className="space-y-4 mt-4">
          {loadingPending ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}</div>
          ) : totalPending === 0 ? (
            <Card>
              <CardContent className="flex items-center gap-3 py-8 text-muted-foreground justify-center">
                <CheckCircle className="w-6 h-6 text-success" />
                <p>Todos os produtos estão confirmados!</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {/* Critical */}
              {(pending?.critical?.length ?? 0) > 0 && (
                <div>
                  <p className="text-xs font-medium text-destructive mb-2 flex items-center gap-1">
                    <XCircle className="w-3.5 h-3.5" /> Críticos — mais de 30 dias sem confirmação
                  </p>
                  <div className="space-y-1">
                    {pending.critical.map((p: any) => (
                      <PendingProductRow key={p.id} product={p} onConfirm={() => {
                        apiFetch(`/stock-monitoring/confirm/${p.id}`, { method: 'POST', body: JSON.stringify({}) })
                          .then(() => { toast.success(`${p.nome} confirmado!`); qc.invalidateQueries({ queryKey: ['stock-monitoring'] }) })
                          .catch(() => toast.error('Erro ao confirmar'))
                      }} />
                    ))}
                  </div>
                </div>
              )}
              {/* Warning */}
              {(pending?.warning?.length ?? 0) > 0 && (
                <div>
                  <p className="text-xs font-medium text-warning mb-2 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" /> Em alerta — 7 a 30 dias
                  </p>
                  <div className="space-y-1">
                    {pending.warning.map((p: any) => (
                      <PendingProductRow key={p.id} product={p} onConfirm={() => {
                        apiFetch(`/stock-monitoring/confirm/${p.id}`, { method: 'POST', body: JSON.stringify({}) })
                          .then(() => { toast.success(`${p.nome} confirmado!`); qc.invalidateQueries({ queryKey: ['stock-monitoring'] }) })
                          .catch(() => toast.error('Erro ao confirmar'))
                      }} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </TabsContent>

        {/* Rankings */}
        <TabsContent value="rankings" className="mt-4">
          <div className="grid lg:grid-cols-2 gap-4">
            <RankingCard
              title="Mais consultados (semana)"
              icon={TrendingUp}
              items={rankings?.mais_consultados_semana ?? []}
              loading={loadingRankings}
              valueKey="consultas_semana"
              valueSuffix="consultas"
            />
            <RankingCard
              title="Risco de ruptura"
              icon={AlertTriangle}
              items={rankings?.risco_ruptura ?? []}
              loading={loadingRankings}
              valueKey="estoque"
              valueSuffix="em estoque"
              danger
            />
          </div>
        </TabsContent>

        {/* Weekly Report */}
        <TabsContent value="relatorio" className="mt-4 space-y-4">
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => generateReport.mutate()} disabled={generateReport.isPending} className="gap-2">
              <RefreshCw className={cn('w-4 h-4', generateReport.isPending && 'animate-spin')} />
              Gerar agora
            </Button>
            <Button onClick={() => sendReport.mutate()} disabled={sendReport.isPending} className="gap-2">
              <Send className="w-4 h-4" />
              Enviar via WhatsApp
            </Button>
          </div>
          {latestReport ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Relatório: {formatDate(latestReport.week_start)} – {formatDate(latestReport.week_end)}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center p-3 bg-muted rounded-lg">
                    <p className="text-2xl font-bold">{latestReport.data.atendimentos}</p>
                    <p className="text-xs text-muted-foreground">Atendimentos</p>
                  </div>
                  <div className="text-center p-3 bg-muted rounded-lg">
                    <p className="text-2xl font-bold">{latestReport.data.clientes_novos}</p>
                    <p className="text-xs text-muted-foreground">Clientes novos</p>
                  </div>
                </div>
                {latestReport.data.produtos_mais_consultados?.length > 0 && (
                  <div>
                    <p className="text-xs font-medium mb-2">Mais consultados</p>
                    {latestReport.data.produtos_mais_consultados.map((p: any, i: number) => (
                      <div key={i} className="flex justify-between text-sm py-1 border-b last:border-0">
                        <span>{p.nome}</span>
                        <span className="text-muted-foreground">{p.consultas} consultas</span>
                      </div>
                    ))}
                  </div>
                )}
                {latestReport.sent_whatsapp && (
                  <p className="text-xs text-success flex items-center gap-1">
                    <CheckCircle className="w-3.5 h-3.5" />
                    Enviado por WhatsApp
                  </p>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="text-center py-8 text-muted-foreground">
                <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p>Nenhum relatório gerado ainda</p>
                <p className="text-xs">O relatório é gerado automaticamente toda segunda-feira às 8h</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Audit */}
        <TabsContent value="auditoria" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <ScrollArea className="h-80">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/30">
                    <tr>
                      <th className="text-left p-3 text-xs text-muted-foreground font-medium">Ação</th>
                      <th className="text-left p-3 text-xs text-muted-foreground font-medium">Produto</th>
                      <th className="text-left p-3 text-xs text-muted-foreground font-medium">Usuário</th>
                      <th className="text-left p-3 text-xs text-muted-foreground font-medium">Fonte</th>
                      <th className="text-right p-3 text-xs text-muted-foreground font-medium">Data</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(auditLogs?.logs ?? []).map((log: any) => (
                      <tr key={log.id} className="border-b hover:bg-muted/20">
                        <td className="p-3">
                          <Badge variant="outline" className="text-xs capitalize">
                            {log.action.replace(/_/g, ' ')}
                          </Badge>
                        </td>
                        <td className="p-3 text-sm truncate max-w-32">{log.entity_name}</td>
                        <td className="p-3 text-muted-foreground text-xs">{log.user_name ?? '—'}</td>
                        <td className="p-3 text-muted-foreground text-xs">{log.source}</td>
                        <td className="p-3 text-right text-xs text-muted-foreground">
                          {formatDate(log.created_at)}
                        </td>
                      </tr>
                    ))}
                    {(!auditLogs?.logs?.length) && (
                      <tr>
                        <td colSpan={5} className="text-center py-8 text-muted-foreground">
                          Nenhum registro de auditoria
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function PendingProductRow({ product, onConfirm }: { product: any; onConfirm: () => void }) {
  return (
    <div className="flex items-center justify-between p-3 bg-card border rounded-lg hover:bg-muted/30">
      <div className="flex items-center gap-3 min-w-0">
        <ConfirmationBadge dias={product.dias_sem_confirmacao} />
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{product.nome}</p>
          <p className="text-xs text-muted-foreground">
            {formatDays(product.dias_sem_confirmacao)} · Estoque: {product.estoque}
          </p>
        </div>
      </div>
      <Button size="sm" variant="outline" onClick={onConfirm} className="shrink-0 gap-1">
        <CheckCircle className="w-3.5 h-3.5" />
        Confirmar
      </Button>
    </div>
  )
}

function RankingCard({
  title, icon: Icon, items, loading, valueKey, valueSuffix, danger = false,
}: {
  title: string; icon: any; items: any[]; loading: boolean
  valueKey: string; valueSuffix: string; danger?: boolean
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Icon className={cn('w-4 h-4', danger ? 'text-warning' : 'text-primary')} />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? <Skeleton className="h-32 w-full" /> : items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Sem dados ainda</p>
        ) : (
          <div className="space-y-2">
            {items.slice(0, 5).map((item: any, i: number) => (
              <div key={item.id || i} className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs text-muted-foreground w-4">{i + 1}.</span>
                  <p className="text-sm truncate">{item.nome}</p>
                </div>
                <span className={cn('text-xs font-medium shrink-0 ml-2',
                  danger && item[valueKey] <= 5 ? 'text-destructive' : 'text-muted-foreground'
                )}>
                  {item[valueKey]} {valueSuffix}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
