'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  Search, Plus, Package, AlertTriangle, TrendingDown,
  MoreHorizontal, Edit, Trash2, RefreshCw, FolderOpen,
  Layers, ShieldCheck, Bot,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import { productsApi, categoriesApi, type ProductCategory } from '@/lib/api'
import type { Produto } from '@/lib/types'
import { cn } from '@/lib/utils'
import { AdminAiAssistant } from '@/components/admin/admin-ai-assistant'

const ESTOQUE_STATUS: Record<string, { label: string; color: string }> = {
  sem_estoque: { label: 'Zerado', color: 'bg-destructive/10 text-destructive' },
  critico: { label: 'Crítico', color: 'bg-destructive/10 text-destructive' },
  baixo: { label: 'Baixo', color: 'bg-warning/10 text-warning' },
  normal: { label: 'Normal', color: 'bg-success/10 text-success' },
}

const fadeInUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.35 },
}

type StockOp = 'adicionar' | 'remover' | 'corrigir'

interface Summary {
  total: number
  ativos: number
  inativos: number
  zerados: number
  abaixo_minimo: number
  promocao: number
}

const emptyForm = {
  nome: '', descricao: '', categoria: '', marca: '', sku: '',
  preco: '', preco_promocional: '', estoque: '0', estoque_minimo: '5',
  unidade: 'un', ativo: true, destaque: false,
}

export function ProdutosContent() {
  const [tab, setTab] = useState('produtos')
  const [products, setProducts] = useState<Produto[]>([])
  const [total, setTotal] = useState(0)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [categories, setCategories] = useState<ProductCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [categoria, setCategoria] = useState('todos')
  const [filtroAtivo, setFiltroAtivo] = useState('todos')
  const [filtroEstoque, setFiltroEstoque] = useState('todos')
  const [filtroPromo, setFiltroPromo] = useState(false)
  const [editProduct, setEditProduct] = useState<Produto | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState(emptyForm)
  const [stockDialog, setStockDialog] = useState<{ product: Produto; op: StockOp } | null>(null)
  const [stockQty, setStockQty] = useState(1)
  const [stockMotivo, setStockMotivo] = useState('')
  const [catDialog, setCatDialog] = useState<ProductCategory | null | 'new'>(null)
  const [catName, setCatName] = useState('')
  const [aiOpen, setAiOpen] = useState(false)

  const fetchCategories = useCallback(async () => {
    try {
      const data = await categoriesApi.list(true)
      setCategories(data.categories || [])
    } catch {
      toast.error('Erro ao carregar categorias')
    }
  }, [])

  const fetchSummary = useCallback(async () => {
    try {
      const data = await productsApi.getSummary()
      setSummary(data)
    } catch {
      /* non-critical */
    }
  }, [])

  const fetchProducts = useCallback(async () => {
    setLoading(true)
    try {
      const params: Parameters<typeof productsApi.list>[0] = { busca }
      if (categoria !== 'todos') params.categoria = categoria
      if (filtroAtivo === 'ativos') params.ativo = true
      if (filtroAtivo === 'inativos') params.ativo = false
      if (filtroEstoque === 'baixo') params.estoque_baixo = true
      else if (filtroEstoque !== 'todos') params.estoque_status = filtroEstoque
      if (filtroPromo) params.promocao = true

      const data = await productsApi.list(params) as {
        products: Produto[]
        total: number
      }
      setProducts(data.products || [])
      setTotal(data.total || 0)
    } catch {
      toast.error('Erro ao carregar produtos')
    } finally {
      setLoading(false)
    }
  }, [busca, categoria, filtroAtivo, filtroEstoque, filtroPromo])

  useEffect(() => {
    fetchCategories()
    fetchSummary()
  }, [fetchCategories, fetchSummary])

  useEffect(() => {
    fetchProducts()
  }, [fetchProducts])

  const categoryLabel = (slug: string | null | undefined) => {
    if (!slug) return '—'
    const cat = categories.find(c => c.slug === slug)
    return cat?.name || slug.replace(/_/g, ' ')
  }

  const activeCategories = categories.filter(c => c.active)

  const handleDelete = async (id: string) => {
    try {
      await productsApi.update(id, { ativo: false })
      toast.success('Produto desativado')
      fetchProducts()
      fetchSummary()
    } catch {
      toast.error('Erro ao desativar produto')
    }
  }

  const handleStockAdjust = async () => {
    if (!stockDialog) return
    if (!stockMotivo.trim() || stockMotivo.trim().length < 3) {
      toast.error('Informe o motivo do ajuste (mín. 3 caracteres)')
      return
    }
    if (stockDialog.op !== 'corrigir' && stockQty < 1) {
      toast.error('Quantidade deve ser pelo menos 1')
      return
    }
    try {
      await productsApi.updateStock(
        stockDialog.product.id,
        stockQty,
        stockDialog.op,
        stockMotivo.trim(),
      )
      toast.success('Estoque atualizado')
      setStockDialog(null)
      setStockMotivo('')
      setStockQty(1)
      fetchProducts()
      fetchSummary()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao ajustar estoque')
    }
  }

  const handleOpenForm = (product: Produto | null = null) => {
    if (product) {
      setFormData({
        nome: product.nome,
        descricao: product.descricao || '',
        categoria: product.categoria || '',
        marca: product.marca || '',
        sku: product.sku || '',
        preco: String(product.preco),
        preco_promocional: product.preco_promocional ? String(product.preco_promocional) : '',
        estoque: String(product.estoque),
        estoque_minimo: String(product.estoque_minimo || 5),
        unidade: product.unidade || 'un',
        ativo: product.ativo ?? true,
        destaque: product.destaque ?? false,
      })
    } else {
      setFormData(emptyForm)
    }
    setEditProduct(product)
    setShowForm(true)
  }

  const handleSaveProduct = async () => {
    if (!formData.nome.trim() || !formData.preco) {
      toast.error('Nome e preço são obrigatórios')
      return
    }
    if (!formData.categoria) {
      toast.error('Selecione uma categoria')
      return
    }
    try {
      const payload = {
        nome: formData.nome,
        descricao: formData.descricao,
        categoria: formData.categoria,
        marca: formData.marca,
        sku: formData.sku,
        preco: parseFloat(formData.preco),
        preco_promocional: formData.preco_promocional ? parseFloat(formData.preco_promocional) : null,
        estoque: parseInt(formData.estoque, 10),
        estoque_minimo: parseInt(formData.estoque_minimo, 10),
        unidade: formData.unidade,
        ativo: formData.ativo,
        destaque: formData.destaque,
      }
      if (editProduct) {
        await productsApi.update(editProduct.id, payload)
        toast.success('Produto atualizado!')
      } else {
        await productsApi.create(payload)
        toast.success('Produto criado!')
      }
      setShowForm(false)
      fetchProducts()
      fetchSummary()
      fetchCategories()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao salvar produto')
    }
  }

  const handleSaveCategory = async () => {
    if (!catName.trim() || catName.trim().length < 2) {
      toast.error('Nome da categoria deve ter pelo menos 2 caracteres')
      return
    }
    try {
      if (catDialog === 'new') {
        await categoriesApi.create(catName.trim())
        toast.success('Categoria criada')
      } else if (catDialog) {
        await categoriesApi.update(catDialog.id, { name: catName.trim() })
        toast.success('Categoria atualizada')
      }
      setCatDialog(null)
      setCatName('')
      fetchCategories()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao salvar categoria')
    }
  }

  const handleToggleCategory = async (cat: ProductCategory) => {
    try {
      await categoriesApi.update(cat.id, { active: !cat.active })
      toast.success(cat.active ? 'Categoria desativada' : 'Categoria ativada')
      fetchCategories()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao alterar categoria')
    }
  }

  const handleDeleteCategory = async (cat: ProductCategory) => {
    try {
      await categoriesApi.delete(cat.id)
      toast.success('Categoria excluída')
      fetchCategories()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro ao excluir'
      if (msg.includes('409') || msg.toLowerCase().includes('excluir')) {
        toast.error('Categoria em uso. Desative em vez de excluir.')
      } else {
        toast.error(msg)
      }
    }
  }

  const refreshAll = () => {
    fetchProducts()
    fetchSummary()
    fetchCategories()
  }

  return (
    <div className="space-y-6">
      <motion.div {...fadeInUp} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold">Produtos e Estoque</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Gerencie catálogo, categorias e níveis de estoque da loja
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="icon" onClick={refreshAll} aria-label="Atualizar">
            <RefreshCw className="w-4 h-4" />
          </Button>
          {tab === 'produtos' && (
            <>
              <Button onClick={() => setAiOpen(true)} className="gap-2">
                <Bot className="w-4 h-4" />
                Assistente de Gestão IA
              </Button>
              <Button variant="outline" onClick={() => handleOpenForm(null)} className="gap-2">
                <Plus className="w-4 h-4" />
                Novo Produto
              </Button>
            </>
          )}
          {tab === 'categorias' && (
            <Button onClick={() => { setCatDialog('new'); setCatName('') }} className="gap-2">
              <Plus className="w-4 h-4" />
              Nova Categoria
            </Button>
          )}
        </div>
      </motion.div>

      {summary && (
        <motion.div {...fadeInUp} transition={{ delay: 0.05 }} className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: 'Ativos', value: summary.ativos, color: '' },
            { label: 'Zerados', value: summary.zerados, color: 'text-destructive' },
            { label: 'Abaixo mín.', value: summary.abaixo_minimo, color: 'text-warning' },
            { label: 'Em promoção', value: summary.promocao, color: 'text-success' },
            { label: 'Inativos', value: summary.inativos, color: 'text-muted-foreground' },
            { label: 'Total', value: summary.total, color: '' },
          ].map(item => (
            <Card key={item.label}>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">{item.label}</p>
                <p className={cn('text-2xl font-bold', item.color)}>{item.value}</p>
              </CardContent>
            </Card>
          ))}
        </motion.div>
      )}

      {(summary?.zerados ?? 0) > 0 || (summary?.abaixo_minimo ?? 0) > 0 ? (
        <motion.div {...fadeInUp} transition={{ delay: 0.08 }}>
          <Card className="border-warning/30 bg-warning/5">
            <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-warning shrink-0" />
              <p className="text-sm flex-1">
                <strong>{summary?.zerados ?? 0} zerado(s)</strong> e{' '}
                <strong>{summary?.abaixo_minimo ?? 0} abaixo do mínimo</strong>.
                Revise o estoque para evitar rupturas.
              </p>
              <Button variant="outline" size="sm" onClick={() => { setTab('alertas') }}>
                Ver alertas
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      ) : null}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full max-w-lg grid-cols-3">
          <TabsTrigger value="produtos" className="gap-1.5">
            <Package className="w-4 h-4" /> Produtos
          </TabsTrigger>
          <TabsTrigger value="categorias" className="gap-1.5">
            <FolderOpen className="w-4 h-4" /> Categorias
          </TabsTrigger>
          <TabsTrigger value="alertas" className="gap-1.5">
            <Layers className="w-4 h-4" /> Alertas
          </TabsTrigger>
        </TabsList>

        <TabsContent value="produtos" className="space-y-4 mt-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar produto, SKU, marca..."
                value={busca}
                onChange={e => setBusca(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={categoria} onValueChange={setCategoria}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Categoria" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas categorias</SelectItem>
                {activeCategories.map(c => (
                  <SelectItem key={c.id} value={c.slug}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filtroAtivo} onValueChange={setFiltroAtivo}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="ativos">Ativos</SelectItem>
                <SelectItem value="inativos">Inativos</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filtroEstoque} onValueChange={setFiltroEstoque}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Estoque" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todo estoque</SelectItem>
                <SelectItem value="baixo">Estoque baixo</SelectItem>
                <SelectItem value="sem_estoque">Zerado</SelectItem>
                <SelectItem value="critico">Crítico</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant={filtroPromo ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFiltroPromo(p => !p)}
            >
              Promoção
            </Button>
          </div>

          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left p-4 font-medium text-muted-foreground">Produto</th>
                    <th className="text-left p-4 font-medium text-muted-foreground hidden md:table-cell">Categoria</th>
                    <th className="text-right p-4 font-medium text-muted-foreground">Preço</th>
                    <th className="text-center p-4 font-medium text-muted-foreground">Estoque</th>
                    <th className="text-center p-4 font-medium text-muted-foreground hidden sm:table-cell">Status</th>
                    <th className="text-right p-4 font-medium text-muted-foreground">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i} className="border-b">
                        {Array.from({ length: 6 }).map((_, j) => (
                          <td key={j} className="p-4">
                            <div className="h-4 bg-muted animate-pulse rounded" />
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : products.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-12 text-muted-foreground">
                        <Package className="w-8 h-8 mx-auto mb-2 opacity-30" />
                        Nenhum produto encontrado
                      </td>
                    </tr>
                  ) : products.map(product => {
                    const estoqueStatus = product.estoque_status || 'normal'
                    const statusConfig = ESTOQUE_STATUS[estoqueStatus] || ESTOQUE_STATUS.normal
                    return (
                      <tr key={product.id} className={cn('border-b hover:bg-muted/20', !product.ativo && 'opacity-60')}>
                        <td className="p-4">
                          <div>
                            <p className="font-medium flex items-center gap-2">
                              {product.nome}
                              {product.destaque && <Badge variant="secondary" className="text-xs">Destaque</Badge>}
                              {!product.ativo && <Badge variant="outline" className="text-xs">Inativo</Badge>}
                            </p>
                            <p className="text-xs text-muted-foreground">{product.sku} · {product.marca}</p>
                          </div>
                        </td>
                        <td className="p-4 text-muted-foreground hidden md:table-cell">
                          {categoryLabel(product.categoria)}
                        </td>
                        <td className="p-4 text-right">
                          <p className="font-medium">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(product.preco)}
                          </p>
                          {product.preco_promocional ? (
                            <p className="text-xs text-success">
                              Promo: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(product.preco_promocional)}
                            </p>
                          ) : null}
                        </td>
                        <td className="p-4 text-center">
                          <span className={cn(
                            'font-bold',
                            product.estoque === 0 ? 'text-destructive' :
                              product.estoque <= product.estoque_minimo ? 'text-warning' : '',
                          )}>
                            {product.estoque}
                          </span>
                          <span className="text-xs text-muted-foreground ml-1">{product.unidade}</span>
                          <p className="text-xs text-muted-foreground">mín. {product.estoque_minimo}</p>
                        </td>
                        <td className="p-4 text-center hidden sm:table-cell">
                          <Badge className={cn('text-xs', statusConfig.color)}>{statusConfig.label}</Badge>
                        </td>
                        <td className="p-4 text-right">
                          <ProductActions
                            product={product}
                            onEdit={() => handleOpenForm(product)}
                            onStock={op => { setStockDialog({ product, op }); setStockQty(1); setStockMotivo('') }}
                            onDeactivate={() => handleDelete(product.id)}
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {total > products.length && (
              <p className="text-xs text-muted-foreground p-3 border-t">
                Exibindo {products.length} de {total} produtos
              </p>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="categorias" className="mt-4">
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left p-4 font-medium text-muted-foreground">Nome</th>
                    <th className="text-left p-4 font-medium text-muted-foreground hidden sm:table-cell">Identificador</th>
                    <th className="text-center p-4 font-medium text-muted-foreground">Produtos</th>
                    <th className="text-center p-4 font-medium text-muted-foreground">Status</th>
                    <th className="text-right p-4 font-medium text-muted-foreground">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {categories.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center py-12 text-muted-foreground">
                        Nenhuma categoria cadastrada
                      </td>
                    </tr>
                  ) : categories.map(cat => (
                    <tr key={cat.id} className={cn('border-b hover:bg-muted/20', !cat.active && 'opacity-60')}>
                      <td className="p-4 font-medium">{cat.name}</td>
                      <td className="p-4 text-muted-foreground hidden sm:table-cell font-mono text-xs">{cat.slug}</td>
                      <td className="p-4 text-center">{cat.product_count}</td>
                      <td className="p-4 text-center">
                        <Badge className={cat.active ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'}>
                          {cat.active ? 'Ativa' : 'Inativa'}
                        </Badge>
                      </td>
                      <td className="p-4 text-right space-x-1">
                        <Button variant="ghost" size="sm" onClick={() => { setCatDialog(cat); setCatName(cat.name) }}>
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleToggleCategory(cat)}>
                          {cat.active ? 'Desativar' : 'Ativar'}
                        </Button>
                        {cat.product_count === 0 && (
                          <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleDeleteCategory(cat)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="alertas" className="mt-4 space-y-4">
          <AlertasTab
            onAdjust={(product, op) => { setStockDialog({ product, op }); setStockQty(op === 'corrigir' ? product.estoque : 1); setStockMotivo('') }}
          />
          <Card className="border-dashed">
            <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <ShieldCheck className="w-5 h-5 text-primary shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium">Confirmação inteligente de estoque</p>
                <p className="text-xs text-muted-foreground">
                  Rankings, confirmações periódicas e auditoria detalhada estão no módulo de Estoque Inteligente.
                </p>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link href="/admin/estoque-inteligente">Abrir Est. Inteligente</Link>
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Product form */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editProduct ? 'Editar Produto' : 'Novo Produto'}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-2">
            <div className="sm:col-span-2 space-y-1">
              <Label>Nome *</Label>
              <Input value={formData.nome} onChange={e => setFormData(f => ({ ...f, nome: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Preço (R$) *</Label>
              <Input type="number" step="0.01" value={formData.preco} onChange={e => setFormData(f => ({ ...f, preco: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Preço Promocional</Label>
              <Input type="number" step="0.01" value={formData.preco_promocional} onChange={e => setFormData(f => ({ ...f, preco_promocional: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Estoque</Label>
              <Input type="number" value={formData.estoque} onChange={e => setFormData(f => ({ ...f, estoque: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Estoque Mínimo</Label>
              <Input type="number" value={formData.estoque_minimo} onChange={e => setFormData(f => ({ ...f, estoque_minimo: e.target.value }))} />
            </div>
            <div className="sm:col-span-2 space-y-1">
              <Label>Categoria *</Label>
              <Select value={formData.categoria || undefined} onValueChange={v => setFormData(f => ({ ...f, categoria: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {activeCategories.map(c => (
                    <SelectItem key={c.id} value={c.slug}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Marca</Label>
              <Input value={formData.marca} onChange={e => setFormData(f => ({ ...f, marca: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>SKU</Label>
              <Input value={formData.sku} onChange={e => setFormData(f => ({ ...f, sku: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Unidade</Label>
              <Input value={formData.unidade} onChange={e => setFormData(f => ({ ...f, unidade: e.target.value }))} placeholder="un, kg, L..." />
            </div>
            <div className="flex items-center gap-4 sm:col-span-2">
              <div className="flex items-center gap-2">
                <Switch checked={formData.ativo} onCheckedChange={v => setFormData(f => ({ ...f, ativo: v }))} />
                <Label>Ativo</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={formData.destaque} onCheckedChange={v => setFormData(f => ({ ...f, destaque: v }))} />
                <Label>Destaque na vitrine</Label>
              </div>
            </div>
            <div className="sm:col-span-2 space-y-1">
              <Label>Descrição</Label>
              <textarea
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                rows={2}
                value={formData.descricao}
                onChange={e => setFormData(f => ({ ...f, descricao: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button onClick={handleSaveProduct}>{editProduct ? 'Salvar' : 'Criar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Stock adjust */}
      <Dialog open={!!stockDialog} onOpenChange={() => setStockDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {stockDialog?.op === 'adicionar' && 'Entrada de estoque'}
              {stockDialog?.op === 'remover' && 'Saída de estoque'}
              {stockDialog?.op === 'corrigir' && 'Correção de estoque'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              {stockDialog?.product.nome} — atual:{' '}
              <strong>{stockDialog?.product.estoque} {stockDialog?.product.unidade}</strong>
            </p>
            <div className="space-y-1">
              <Label>{stockDialog?.op === 'corrigir' ? 'Novo estoque' : 'Quantidade'}</Label>
              <Input type="number" min={0} value={stockQty} onChange={e => setStockQty(Number(e.target.value))} />
            </div>
            <div className="space-y-1">
              <Label>Motivo / observação *</Label>
              <Input
                value={stockMotivo}
                onChange={e => setStockMotivo(e.target.value)}
                placeholder="Ex: contagem física, devolução..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStockDialog(null)}>Cancelar</Button>
            <Button onClick={handleStockAdjust}>Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Category form */}
      <Dialog open={!!catDialog} onOpenChange={() => setCatDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{catDialog === 'new' ? 'Nova Categoria' : 'Editar Categoria'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Nome *</Label>
              <Input value={catName} onChange={e => setCatName(e.target.value)} placeholder="Ex: Rações Pet" />
            </div>
            {catDialog && catDialog !== 'new' && (
              <p className="text-xs text-muted-foreground">
                Identificador: <code>{catDialog.slug}</code> — não alterável para manter produtos vinculados.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCatDialog(null)}>Cancelar</Button>
            <Button onClick={handleSaveCategory}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AdminAiAssistant
        open={aiOpen}
        onOpenChange={setAiOpen}
        onActionComplete={refreshAll}
      />
    </div>
  )
}

function ProductActions({
  product, onEdit, onStock, onDeactivate,
}: {
  product: Produto
  onEdit: () => void
  onStock: (op: StockOp) => void
  onDeactivate: () => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreHorizontal className="w-4 h-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onEdit}><Edit className="w-4 h-4 mr-2" /> Editar</DropdownMenuItem>
        <DropdownMenuItem onClick={() => onStock('adicionar')}>
          <TrendingDown className="w-4 h-4 mr-2 rotate-180" /> Entrada
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onStock('remover')}>
          <TrendingDown className="w-4 h-4 mr-2" /> Saída
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onStock('corrigir')}>Correção</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-destructive" onClick={onDeactivate}>
          <Trash2 className="w-4 h-4 mr-2" /> Desativar
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function AlertasTab({ onAdjust }: { onAdjust: (p: Produto, op: StockOp) => void }) {
  const [items, setItems] = useState<Produto[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    productsApi.getLowStock()
      .then(data => setItems((data as { products?: Produto[] }).products || []))
      .catch(() => toast.error('Erro ao carregar alertas'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <Card><CardContent className="p-8 text-center text-muted-foreground">Carregando...</CardContent></Card>
  }

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          <Package className="w-8 h-8 mx-auto mb-2 opacity-30" />
          Nenhum produto com estoque baixo ou zerado
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/30">
              <th className="text-left p-4">Produto</th>
              <th className="text-center p-4">Estoque</th>
              <th className="text-center p-4">Mínimo</th>
              <th className="text-right p-4">Ação</th>
            </tr>
          </thead>
          <tbody>
            {items.map(p => (
              <tr key={p.id} className="border-b">
                <td className="p-4 font-medium">{p.nome}</td>
                <td className={cn('p-4 text-center font-bold', p.estoque === 0 ? 'text-destructive' : 'text-warning')}>
                  {p.estoque} {p.unidade}
                </td>
                <td className="p-4 text-center text-muted-foreground">{p.estoque_minimo}</td>
                <td className="p-4 text-right">
                  <Button size="sm" variant="outline" onClick={() => onAdjust(p, 'corrigir')}>
                    Ajustar
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
