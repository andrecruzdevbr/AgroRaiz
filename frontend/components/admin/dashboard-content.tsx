'use client'

import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  Users, Package, MessageSquare, Megaphone, Bot, Database,
  AlertTriangle, ArrowRight, ShieldCheck,
  CheckCircle, XCircle, Zap,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { useDashboardMetrics, useDashboardActivity, useSystemHealth, useLowStockProducts } from '@/lib/hooks'
import { apiFetch } from '@/lib/api'

const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4 },
}

const SHORTCUTS = [
  { href: '/admin/clientes', label: 'Cadastrar cliente', icon: Users },
  { href: '/admin/produtos', label: 'Cadastrar produto', icon: Package },
  { href: '/admin/estoque-inteligente', label: 'Ajustar estoque', icon: ShieldCheck },
  { href: '/admin/conversas', label: 'Abrir conversas', icon: MessageSquare },
  { href: '/admin/campanhas', label: 'Criar campanha', icon: Megaphone },
  { href: '/admin/ia', label: 'Configurar IA', icon: Bot },
] as const

function MetricCard({
  label,
  value,
  subValue,
  icon: Icon,
  alert = false,
  href,
}: {
  label: string
  value: string | number
  subValue?: string
  icon: React.ElementType
  alert?: boolean
  href?: string
}) {
  const inner = (
    <Card
      className={cn(
        'transition-all hover:shadow-sm h-full',
        alert && 'border-warning/40 bg-warning/5',
        href && 'cursor-pointer hover:border-primary/30',
      )}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className={cn('p-2 rounded-lg', alert ? 'bg-warning/10' : 'bg-muted')}>
            <Icon className={cn('h-4 w-4', alert ? 'text-warning' : 'text-muted-foreground')} />
          </div>
        </div>
        <p className={cn('text-2xl font-bold tracking-tight', alert && 'text-warning')}>{value}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
        {subValue && <p className="text-xs text-muted-foreground/70 mt-1">{subValue}</p>}
      </CardContent>
    </Card>
  )
  return href ? <Link href={href}>{inner}</Link> : inner
}

function StatusCard({
  label,
  ok,
  detail,
  icon: Icon,
  href,
}: {
  label: string
  ok: boolean
  detail: string
  icon: React.ElementType
  href?: string
}) {
  const inner = (
    <Card className={cn('h-full', href && 'hover:border-primary/30 transition-colors')}>
      <CardContent className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <div className={cn('p-2 rounded-lg', ok ? 'bg-success/10' : 'bg-destructive/10')}>
            <Icon className={cn('h-4 w-4', ok ? 'text-success' : 'text-destructive')} />
          </div>
          {ok ? (
            <CheckCircle className="h-4 w-4 text-success ml-auto" />
          ) : (
            <XCircle className="h-4 w-4 text-destructive ml-auto" />
          )}
        </div>
        <p className="text-sm font-semibold">{label}</p>
        <p className="text-xs text-muted-foreground mt-1">{detail}</p>
      </CardContent>
    </Card>
  )
  return href ? <Link href={href}>{inner}</Link> : inner
}

export function DashboardContent() {
  const { data: metrics, isLoading } = useDashboardMetrics()
  const { data: activity } = useDashboardActivity()
  const { data: health } = useSystemHealth()
  const { data: lowStockData } = useLowStockProducts()

  const { data: stockStats } = useQuery({
    queryKey: ['stock-monitoring', 'stats'],
    queryFn: () => apiFetch('/stock-monitoring/stats') as Promise<{
      criticos: number
      alertas: number
      pendentes_confirmacao: number
    }>,
    refetchInterval: 120_000,
  })

  const awaitingHuman = metrics?.conversations.awaiting_human ?? 0
  const lowStock = metrics?.inventory.low_stock ?? 0
  const outOfStock = metrics?.inventory.out_of_stock ?? 0
  const stockCritical = stockStats?.criticos ?? 0
  const stockWarning = stockStats?.alertas ?? 0
  const pendingCampaigns = metrics?.campaigns.pending ?? 0

  const alerts: { message: string; href: string; variant: 'destructive' | 'warning' }[] = []

  if (outOfStock > 0) {
    alerts.push({
      message: `${outOfStock} produto(s) sem estoque`,
      href: '/admin/produtos',
      variant: 'destructive',
    })
  }
  if (lowStock > 0) {
    alerts.push({
      message: `${lowStock} produto(s) abaixo do estoque mínimo`,
      href: '/admin/produtos',
      variant: 'warning',
    })
  }
  if (stockCritical > 0) {
    alerts.push({
      message: `${stockCritical} produto(s) com confirmação de estoque crítica`,
      href: '/admin/estoque-inteligente',
      variant: 'destructive',
    })
  } else if (stockWarning > 0) {
    alerts.push({
      message: `${stockWarning} produto(s) aguardando confirmação de estoque`,
      href: '/admin/estoque-inteligente',
      variant: 'warning',
    })
  }
  if (awaitingHuman > 0) {
    alerts.push({
      message: `${awaitingHuman} conversa(s) precisam de atendimento humano`,
      href: '/admin/conversas',
      variant: 'destructive',
    })
  }
  if (pendingCampaigns > 0) {
    alerts.push({
      message: `${pendingCampaigns} campanha(s) em rascunho ou agendadas`,
      href: '/admin/campanhas',
      variant: 'warning',
    })
  }

  const lowStockProducts = (lowStockData as { products?: { nome: string; estoque: number; estoque_minimo: number }[] })?.products ?? []

  return (
    <div className="space-y-6">
      <motion.div {...fadeInUp} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-foreground">Painel da Loja</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Resumo rápido da situação da Agro Raiz hoje.
          </p>
        </div>
      </motion.div>

      {/* Atalhos */}
      <motion.div {...fadeInUp} transition={{ delay: 0.05 }}>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Ações rápidas</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              {SHORTCUTS.map(({ href, label, icon: Icon }) => (
                <Link key={href} href={href}>
                  <Button
                    variant="outline"
                    className="w-full h-auto flex-col gap-2 py-4 px-2 text-xs font-medium"
                  >
                    <Icon className="h-4 w-4 text-primary" />
                    <span className="text-center leading-tight">{label}</span>
                  </Button>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Cards principais */}
      <motion.div
        {...fadeInUp}
        transition={{ delay: 0.1 }}
        className="grid grid-cols-2 lg:grid-cols-4 gap-4"
      >
        {isLoading ? (
          Array.from({ length: 7 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-5">
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          ))
        ) : metrics ? (
          <>
            <MetricCard
              label="Clientes cadastrados"
              value={metrics.customers.total.toLocaleString('pt-BR')}
              subValue={
                metrics.customers.total === 0
                  ? 'Nenhum cliente ainda'
                  : metrics.customers.new > 0
                    ? `${metrics.customers.new} novo(s) no período`
                    : 'Cadastre seus clientes'
              }
              icon={Users}
              href="/admin/clientes"
            />
            <MetricCard
              label="Produtos no catálogo"
              value={metrics.inventory.total.toLocaleString('pt-BR')}
              subValue="Produtos ativos na loja"
              icon={Package}
              href="/admin/produtos"
            />
            <MetricCard
              label="Estoque baixo"
              value={lowStock}
              subValue={
                outOfStock > 0
                  ? `${outOfStock} sem estoque`
                  : lowStock > 0
                    ? 'Abaixo do mínimo'
                    : 'Tudo dentro do mínimo'
              }
              icon={AlertTriangle}
              alert={lowStock > 0 || outOfStock > 0}
              href="/admin/produtos"
            />
            <MetricCard
              label="Conversas abertas"
              value={metrics.conversations.open}
              subValue={
                awaitingHuman > 0
                  ? `${awaitingHuman} aguardando você`
                  : metrics.conversations.open > 0
                    ? 'Em andamento'
                    : 'Nenhuma conversa aberta'
              }
              icon={MessageSquare}
              alert={awaitingHuman > 0}
              href="/admin/conversas"
            />
            <MetricCard
              label="Campanhas"
              value={metrics.campaigns.active + pendingCampaigns}
              subValue={
                metrics.campaigns.active > 0
                  ? `${metrics.campaigns.active} ativa(s) · ${pendingCampaigns} pendente(s)`
                  : pendingCampaigns > 0
                    ? `${pendingCampaigns} em rascunho ou agendada(s)`
                    : 'Nenhuma campanha criada'
              }
              icon={Megaphone}
              href="/admin/campanhas"
            />
            <StatusCard
              label="Assistente IA"
              ok={health?.ai.healthy ?? false}
              detail={
                health?.ai.healthy
                  ? `Ana ativa · ${health.ai.provider}`
                  : 'Chave de IA não configurada'
              }
              icon={Bot}
              href="/admin/ia"
            />
            <StatusCard
              label="Banco e cache"
              ok={(health?.database.healthy && health?.redis.healthy) ?? false}
              detail={
                health?.database.healthy && health?.redis.healthy
                  ? 'Banco e Redis funcionando'
                  : !health?.database.healthy
                    ? 'Problema no banco de dados'
                    : 'Problema no Redis'
              }
              icon={Database}
            />
          </>
        ) : null}
      </motion.div>

      {/* Alertas */}
      {alerts.length > 0 && (
        <motion.div {...fadeInUp} transition={{ delay: 0.15 }} className="space-y-3">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning" />
            Atenção agora
          </h2>
          <div className="flex flex-col gap-2">
            {alerts.map((alert) => (
              <Link key={alert.message} href={alert.href}>
                <Card
                  className={cn(
                    'cursor-pointer transition-colors hover:border-primary/30',
                    alert.variant === 'destructive' && 'border-destructive/30 bg-destructive/5',
                    alert.variant === 'warning' && 'border-warning/30 bg-warning/5',
                  )}
                >
                  <CardContent className="p-4 flex items-center justify-between gap-3">
                    <p className="text-sm font-medium">{alert.message}</p>
                    <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>

          {lowStockProducts.length > 0 && (
            <Card className="border-warning/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Produtos com estoque baixo</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-2">
                {lowStockProducts.slice(0, 5).map((p) => (
                  <div
                    key={p.nome}
                    className="flex items-center justify-between text-sm py-1.5 border-b border-border/50 last:border-0"
                  >
                    <span className="truncate font-medium">{p.nome}</span>
                    <Badge variant="outline" className="shrink-0 text-warning border-warning/40">
                      {p.estoque} / mín. {p.estoque_minimo}
                    </Badge>
                  </div>
                ))}
                {lowStockProducts.length > 5 && (
                  <Link href="/admin/produtos">
                    <Button variant="ghost" size="sm" className="w-full text-xs mt-1">
                      Ver todos ({lowStockProducts.length})
                    </Button>
                  </Link>
                )}
              </CardContent>
            </Card>
          )}
        </motion.div>
      )}

      {/* Conversas pendentes */}
      <motion.div {...fadeInUp} transition={{ delay: 0.2 }}>
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Conversas que precisam de você</CardTitle>
              <Link href="/admin/conversas">
                <Button variant="ghost" size="sm" className="gap-1 h-7 text-xs">
                  Ver todas <ArrowRight className="h-3 w-3" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            {!activity?.active_conversations?.length ? (
              <div className="flex items-center gap-3 py-6 text-muted-foreground justify-center">
                <Zap className="h-5 w-5 opacity-30" />
                <p className="text-sm">Nenhuma conversa pendente no momento</p>
              </div>
            ) : (
              <div className="space-y-2">
                {activity.active_conversations.slice(0, 5).map((conv) => (
                  <Link key={conv.id} href="/admin/conversas">
                    <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50">
                      <div
                        className={cn(
                          'w-2 h-2 rounded-full shrink-0',
                          conv.status === 'aguardando_humano'
                            ? 'bg-destructive animate-pulse'
                            : 'bg-warning',
                        )}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {conv.cliente?.nome || conv.cliente?.telefone || 'Cliente'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {conv.motivo_transferencia || 'Aguardando atendimento'}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-xs shrink-0',
                          conv.prioridade === 'urgente' && 'border-destructive text-destructive',
                          conv.prioridade === 'alta' && 'border-warning text-warning',
                        )}
                      >
                        {conv.prioridade}
                      </Badge>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Mensagem quando não há alertas */}
      {alerts.length === 0 && !isLoading && (
        <motion.div {...fadeInUp} transition={{ delay: 0.15 }}>
          <Card className="border-success/20 bg-success/5">
            <CardContent className="p-4 flex items-center gap-3">
              <CheckCircle className="h-5 w-5 text-success shrink-0" />
              <p className="text-sm text-muted-foreground">
                Nenhum alerta urgente. A loja está em dia com estoque e atendimentos.
              </p>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  )
}
