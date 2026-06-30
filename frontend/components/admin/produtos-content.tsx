'use client'

import { useState, useMemo, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  Search, Plus, Package, AlertTriangle, TrendingDown,
  MoreHorizontal, Edit, Trash2, ArrowUpDown, Filter,
  RefreshCw
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
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
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { toast } from 'sonner'
import { productsApi } from '@/lib/api'
import type { Produto, CategoriaProduto, CATEGORIAS_LABELS } from '@/lib/types'
import { cn } from '@/lib/utils'

const ESTOQUE_STATUS = {
  sem_estoque: { label: 'Sem estoque', color: 'bg-destructive/10 text-destructive' },
  critico: { label: 'Crítico', color: 'bg-destructive/10 text-destructive' },
  baixo: { label: 'Baixo', color: 'bg-warning/10 text-warning' },
  normal: { label: 'Normal', color: 'bg-success/10 text-success' },
}

const fadeInUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.35 },
}

export function ProdutosContent() {
  const [products, setProducts] = useState<Produto[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [categoria, setCategoria] = useState('todos')
  const [filtroEstoque, setFiltroEstoque] = useState('todos')
  const [editProduct, setEditProduct] = useState<Produto | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({
    nome: '', descricao: '', categoria: '', marca: '', sku: '',
    preco: '', preco_promocional: '', estoque: '0', estoque_minimo: '5',
    unidade: 'un', ativo: true, destaque: false,
  })
  const [stockDialog, setStockDialog] = useState<{ product: Produto; op: 'adicionar' | 'remover' } | null>(null)
  const [stockQty, setStockQty] = useState(1)

  useEffect(() => {
    fetchProducts()
  }, [busca, categoria, filtroEstoque])

  const fetchProducts = async () => {
    setLoading(true)
    try {
      const data = await productsApi.list({
        busca,
        categoria: categoria === 'todos' ? undefined : categoria,
        estoque_baixo: filtroEstoque === 'baixo',
      }) as any
      setProducts(data.products || [])
      setTotal(data.total || 0)
    } catch {
      toast.error('Erro ao carregar produtos')
    } finally {
      setLoading(false)
    }
  }

  const lowStockCount = products.filter(p => ['critico', 'sem_estoque'].includes(p.estoque_status as string)).length

  const handleDelete = async (id: string) => {
    try {
      await productsApi.update(id, { ativo: false })
      toast.success('Produto desativado')
      fetchProducts()
    } catch {
      toast.error('Erro ao desativar produto')
    }
  }

  const handleStockAdjust = async () => {
    if (!stockDialog) return
    try {
      await productsApi.updateStock(
        stockDialog.product.id,
        stockQty,
        stockDialog.op,
      )
      toast.success(`Estoque ${stockDialog.op === 'adicionar' ? 'adicionado' : 'removido'} com sucesso`)
      setStockDialog(null)
      fetchProducts()
    } catch {
      toast.error('Erro ao ajustar estoque')
    }
  }

  const handleOpenForm = (product: Produto | null = null) => {
    if (product) {
      setFormData({
        nome: product.nome, descricao: product.descricao || '',
        categoria: product.categoria || '', marca: (product as any).marca || '',
        sku: (product as any).sku || '', preco: String(product.preco),
        preco_promocional: String(product.preco_promocional || ''),
        estoque: String(product.estoque), estoque_minimo: String(product.estoque_minimo || 5),
        unidade: product.unidade || 'un', ativo: (product as any).ativo ?? true,
        destaque: (product as any).destaque ?? false,
      })
    } else {
      setFormData({ nome: '', descricao: '', categoria: '', marca: '', sku: '',
        preco: '', preco_promocional: '', estoque: '0', estoque_minimo: '5',
        unidade: 'un', ativo: true, destaque: false })
    }
    setEditProduct(product)
    setShowForm(true)
  }

  const handleSaveProduct = async () => {
    if (!formData.nome.trim() || !formData.preco) {
      toast.error('Nome e preço são obrigatórios')
      return
    }
    try {
      const payload = {
        nome: formData.nome, descricao: formData.descricao,
        categoria: formData.categoria, marca: formData.marca, sku: formData.sku,
        preco: parseFloat(formData.preco),
        preco_promocional: formData.preco_promocional ? parseFloat(formData.preco_promocional) : null,
        estoque: parseInt(formData.estoque), estoque_minimo: parseInt(formData.estoque_minimo),
        unidade: formData.unidade, ativo: formData.ativo, destaque: formData.destaque,
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
    } catch (e: any) {
      toast.error(e.message || 'Erro ao salvar produto')
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div {...fadeInUp} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold">Produtos</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {total} produtos cadastrados
            {lowStockCount > 0 && (
              <span className="ml-2 text-destructive font-medium">
                · {lowStockCount} com estoque crítico
              </span>
            )}
          </p>
        </div>
        <Button onClick={() => handleOpenForm(null)} className="gap-2">
          <Plus className="w-4 h-4" />
          Novo Produto
        </Button>
      </motion.div>

      {/* Alerts */}
      {lowStockCount > 0 && (
        <motion.div {...fadeInUp} transition={{ delay: 0.05 }}>
          <Card className="border-warning/30 bg-warning/5">
            <CardContent className="p-4 flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-warning shrink-0" />
              <p className="text-sm">
                <strong>{lowStockCount} produto(s)</strong> estão com estoque crítico ou zerado.
                Verifique e reponha o estoque para evitar rupturas.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="ml-auto shrink-0"
                onClick={() => setFiltroEstoque('baixo')}
              >
                Ver agora
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Filters */}
      <motion.div {...fadeInUp} transition={{ delay: 0.1 }} className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar produto, SKU, código..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select value={filtroEstoque} onValueChange={setFiltroEstoque}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Estoque" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="baixo">Estoque Baixo</SelectItem>
          </SelectContent>
        </Select>

        <Button variant="outline" size="icon" onClick={fetchProducts}>
          <RefreshCw className="w-4 h-4" />
        </Button>
      </motion.div>

      {/* Table */}
      <motion.div {...fadeInUp} transition={{ delay: 0.15 }}>
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left p-4 font-medium text-muted-foreground">Produto</th>
                  <th className="text-left p-4 font-medium text-muted-foreground">Categoria</th>
                  <th className="text-right p-4 font-medium text-muted-foreground">Preço</th>
                  <th className="text-center p-4 font-medium text-muted-foreground">Estoque</th>
                  <th className="text-center p-4 font-medium text-muted-foreground">Status</th>
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
                  const estoqueStatus = (product as any).estoque_status || 'normal'
                  const statusConfig = ESTOQUE_STATUS[estoqueStatus as keyof typeof ESTOQUE_STATUS] || ESTOQUE_STATUS.normal
                  return (
                    <tr key={product.id} className="border-b hover:bg-muted/20 transition-colors">
                      <td className="p-4">
                        <div>
                          <p className="font-medium">{product.nome}</p>
                          <p className="text-xs text-muted-foreground">{product.sku} · {product.marca}</p>
                        </div>
                      </td>
                      <td className="p-4 text-muted-foreground capitalize">
                        {product.categoria?.replace(/_/g, ' ')}
                      </td>
                      <td className="p-4 text-right">
                        <div>
                          <p className="font-medium">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(product.preco)}
                          </p>
                          {product.preco_promocional && (
                            <p className="text-xs text-success">
                              Promo: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(product.preco_promocional)}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="p-4 text-center">
                        <span className={cn(
                          'font-bold text-base',
                          product.estoque === 0 ? 'text-destructive' :
                            product.estoque <= product.estoque_minimo ? 'text-warning' : ''
                        )}>
                          {product.estoque}
                        </span>
                        <span className="text-xs text-muted-foreground ml-1">{product.unidade}</span>
                      </td>
                      <td className="p-4 text-center">
                        <Badge className={cn('text-xs', statusConfig.color)}>
                          {statusConfig.label}
                        </Badge>
                      </td>
                      <td className="p-4 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleOpenForm(product)}>
                              <Edit className="w-4 h-4 mr-2" /> Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setStockDialog({ product, op: 'adicionar' })}>
                              <TrendingDown className="w-4 h-4 mr-2 rotate-180" /> Adicionar estoque
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setStockDialog({ product, op: 'remover' })}>
                              <TrendingDown className="w-4 h-4 mr-2" /> Remover estoque
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => handleDelete(product.id)}
                            >
                              <Trash2 className="w-4 h-4 mr-2" /> Desativar
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </motion.div>

      {/* Create/Edit product dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editProduct ? 'Editar Produto' : 'Novo Produto'}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="col-span-2 space-y-1">
              <Label>Nome *</Label>
              <Input value={formData.nome} onChange={e => setFormData(f => ({ ...f, nome: e.target.value }))} placeholder="Nome do produto" />
            </div>
            <div className="space-y-1">
              <Label>Preço (R$) *</Label>
              <Input type="number" step="0.01" value={formData.preco} onChange={e => setFormData(f => ({ ...f, preco: e.target.value }))} placeholder="0,00" />
            </div>
            <div className="space-y-1">
              <Label>Preço Promocional</Label>
              <Input type="number" step="0.01" value={formData.preco_promocional} onChange={e => setFormData(f => ({ ...f, preco_promocional: e.target.value }))} placeholder="0,00" />
            </div>
            <div className="space-y-1">
              <Label>Estoque</Label>
              <Input type="number" value={formData.estoque} onChange={e => setFormData(f => ({ ...f, estoque: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Estoque Mínimo</Label>
              <Input type="number" value={formData.estoque_minimo} onChange={e => setFormData(f => ({ ...f, estoque_minimo: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Categoria</Label>
              <Input value={formData.categoria} onChange={e => setFormData(f => ({ ...f, categoria: e.target.value }))} placeholder="Ex: rações, medicamentos" />
            </div>
            <div className="space-y-1">
              <Label>Marca</Label>
              <Input value={formData.marca} onChange={e => setFormData(f => ({ ...f, marca: e.target.value }))} placeholder="Ex: Golden, Bayer" />
            </div>
            <div className="space-y-1">
              <Label>SKU</Label>
              <Input value={formData.sku} onChange={e => setFormData(f => ({ ...f, sku: e.target.value }))} placeholder="Código interno" />
            </div>
            <div className="space-y-1">
              <Label>Unidade</Label>
              <Input value={formData.unidade} onChange={e => setFormData(f => ({ ...f, unidade: e.target.value }))} placeholder="un, kg, L..." />
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Descrição</Label>
              <textarea className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring" rows={2} value={formData.descricao} onChange={e => setFormData(f => ({ ...f, descricao: e.target.value }))} placeholder="Descrição do produto..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button onClick={handleSaveProduct}>{editProduct ? 'Salvar alterações' : 'Criar produto'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Stock adjust dialog */}
      <Dialog open={!!stockDialog} onOpenChange={() => setStockDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {stockDialog?.op === 'adicionar' ? 'Adicionar' : 'Remover'} Estoque
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              {stockDialog?.product.nome} — estoque atual:{' '}
              <strong>{stockDialog?.product.estoque} {stockDialog?.product.unidade}</strong>
            </p>
            <div className="space-y-1">
              <Label>Quantidade</Label>
              <Input
                type="number"
                min={1}
                value={stockQty}
                onChange={e => setStockQty(Number(e.target.value))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStockDialog(null)}>Cancelar</Button>
            <Button onClick={handleStockAdjust}>Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
