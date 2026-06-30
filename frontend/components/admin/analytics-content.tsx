'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { dashboardApi, getAccessToken } from '@/lib/api'
import { cn } from '@/lib/utils'

const COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))']

export function AnalyticsContent() {
  const [metrics, setMetrics] = useState<any>(null)
  const [salesData, setSalesData] = useState<any[]>([])
  const [categoryData, setCategoryData] = useState<any[]>([])
  const [period, setPeriod] = useState<'7d' | '30d' | '90d'>('30d')
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchAll() }, [period])

  const fetchAll = async () => {
    setLoading(true)
    try {
      const [m, s, c] = await Promise.all([
        dashboardApi.getMetrics(period) as Promise<any>,
        fetch(`/api/v1/dashboard/charts/sales?period=${period}`, {
          headers: { Authorization: `Bearer ${getAccessToken()}` }
        }).then(r => r.json()),
        fetch('/api/v1/dashboard/charts/categories', {
          headers: { Authorization: `Bearer ${getAccessToken()}` }
        }).then(r => r.json()),
      ])
      setMetrics(m)
      setSalesData(s.data || [])
      setCategoryData(c.slice?.(0, 6) || [])
    } catch { /* silent */ }
    finally { setLoading(false) }
  }

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 }).format(v)

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold">Analytics</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Relatórios e métricas da plataforma</p>
        </div>
        <div className="flex gap-1 bg-muted rounded-lg p-1">
          {(['7d', '30d', '90d'] as const).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-md transition-all',
                period === p ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {p === '7d' ? '7 dias' : p === '30d' ? '30 dias' : '90 dias'}
            </button>
          ))}
        </div>
      </motion.div>

      {/* KPI cards */}
      {metrics && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}
          className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Receita total', value: formatCurrency(metrics.revenue?.total || 0), sub: `Tendência: ${metrics.revenue?.trend > 0 ? '+' : ''}${metrics.revenue?.trend}%` },
            { label: 'Novos clientes', value: metrics.customers?.new, sub: `Total: ${metrics.customers?.total}` },
            { label: 'Conversas IA', value: metrics.conversations?.ai_resolved, sub: `Taxa: ${metrics.conversations?.ai_resolution_rate}%` },
            { label: 'Ticket médio', value: formatCurrency(metrics.revenue?.avg_ticket || 0), sub: `${metrics.revenue?.orders} pedidos` },
          ].map(({ label, value, sub }) => (
            <Card key={label}>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground mb-1">{label}</p>
                <p className="text-2xl font-bold">{value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
              </CardContent>
            </Card>
          ))}
        </motion.div>
      )}

      {/* Charts */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Sales chart */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Vendas por dia</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={salesData}>
                  <defs>
                    <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="data" tick={{ fontSize: 11 }} tickLine={false} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false}
                    tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => [formatCurrency(v), 'Vendas']} />
                  <Area type="monotone" dataKey="valor" stroke="hsl(var(--primary))" fill="url(#grad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </motion.div>

        {/* Category chart */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Produtos por categoria</CardTitle>
            </CardHeader>
            <CardContent>
              {categoryData.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={categoryData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} />
                    <YAxis dataKey="categoria" type="category" tick={{ fontSize: 10 }} tickLine={false} width={100}
                      tickFormatter={(v: string) => v?.replace(/_/g, ' ').slice(0, 14)} />
                    <Tooltip />
                    <Bar dataKey="total" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[220px] flex items-center justify-center text-muted-foreground text-sm">
                  Sem dados de categoria
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* AI Analytics */}
      {metrics?.conversations && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 }}>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Performance da IA Ana</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-6 py-2">
                <div className="text-center">
                  <p className="text-3xl font-bold text-primary">{metrics.conversations.ai_resolution_rate}%</p>
                  <p className="text-xs text-muted-foreground mt-1">Taxa de resolução autônoma</p>
                </div>
                <div className="text-center border-x">
                  <p className="text-3xl font-bold">{metrics.conversations.hours_saved}h</p>
                  <p className="text-xs text-muted-foreground mt-1">Horas economizadas</p>
                </div>
                <div className="text-center">
                  <p className="text-3xl font-bold text-amber-500">{metrics.conversations.human_takeovers}</p>
                  <p className="text-xs text-muted-foreground mt-1">Transferências p/ humano</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  )
}
