'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { 
  Search, 
  Plus, 
  Filter, 
  MoreHorizontal,
  Phone,
  Mail,
  MapPin,
  Calendar,
  DollarSign,
  ShoppingBag,
  Tag,
  MessageSquare,
  Edit,
  Trash2,
  X,
  User,
  Star,
  Clock
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle,
  DialogFooter
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useCustomers, useCreateCustomer, useUpdateCustomer } from '@/lib/hooks'
import { useQueryClient } from '@tanstack/react-query'

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 }).format(v)
const formatDate = (d: Date | string | null | undefined) =>
  d ? new Date(d).toLocaleDateString('pt-BR') : '—'
import type { Cliente } from '@/lib/types'
import { toast } from 'sonner'

const frequenciaColors = {
  novo: 'bg-info/10 text-info',
  ocasional: 'bg-warning/10 text-warning',
  frequente: 'bg-success/10 text-success',
  vip: 'bg-primary/10 text-primary'
}

const frequenciaLabels = {
  novo: 'Novo',
  ocasional: 'Ocasional',
  frequente: 'Frequente',
  vip: 'VIP'
}

export function ClientesContent() {
  const [busca, setBusca] = useState('')
  const [filtroFrequencia, setFiltroFrequencia] = useState<string>('todos')
  const [filtroStatus, setFiltroStatus] = useState<string>('todos')
  
  const { data: clientesData, isLoading: loadingClientes } = useCustomers({
    busca,
    status: filtroStatus !== 'todos' ? filtroStatus : undefined,
    frequencia: filtroFrequencia !== 'todos' ? filtroFrequencia : undefined,
  })
  const rawClientes = (clientesData as any)?.customers ?? []
  
  // Normalize API response to match existing Cliente type shape
  const clientes: Cliente[] = rawClientes.map((c: any) => ({
    id: c.id,
    nome: c.name || c.nome || c.phone,
    telefone: c.phone || c.telefone,
    email: c.email,
    tipo: c.tipo || 'pessoa_fisica',
    tags: c.tags || [],
    observacoes: c.observacoes,
    dataCadastro: c.created_at ? new Date(c.created_at) : new Date(),
    totalCompras: c.total_compras ?? c.totalCompras ?? 0,
    valorTotalGasto: c.valor_total_gasto ?? c.valorTotalGasto ?? 0,
    ultimaCompra: c.ultima_compra ? new Date(c.ultima_compra) : undefined,
    frequencia: c.frequencia || 'novo',
    status: c.status || 'ativo',
    preferencias: c.preferencias || { categoriasFavoritas: [], marcasFavoritas: [], frequenciaContato: 'mensal', canalPreferido: 'whatsapp', aceitaPromocoes: true },
    historicoInteracoes: [],
    endereco: c.endereco,
  }))

  const createCustomer = useCreateCustomer()
  const updateCustomer = useUpdateCustomer()
  const [clienteSelecionado, setClienteSelecionado] = useState<Cliente | null>(null)
  const [modalAberto, setModalAberto] = useState(false)
  const [modalNovoCliente, setModalNovoCliente] = useState(false)
  const [novoCliente, setNovoCliente] = useState<{
    nome: string
    telefone: string
    email: string
    tipo: 'pessoa_fisica' | 'pessoa_juridica'
    tags: string
    observacoes: string
  }>({
    nome: '',
    telefone: '',
    email: '',
    tipo: 'pessoa_fisica',
    tags: '',
    observacoes: ''
  })

  const clientesFiltrados = clientes  // Filtered server-side via React Query

  const estatisticas = {
    total: (clientesData as any)?.total ?? clientes.length,
    ativos: clientes.filter(c => c.status === 'ativo').length,
    vips: clientes.filter(c => c.frequencia === 'vip').length,
    valorTotal: clientes.reduce((acc, c) => acc + (c.valorTotalGasto || 0), 0)
  }

  const handleNovoCliente = async () => {
    if (!novoCliente.nome.trim() || !novoCliente.telefone.trim()) {
      toast.error('Nome e telefone são obrigatórios')
      return
    }
    try {
      await createCustomer.mutateAsync({
        name: novoCliente.nome,
        phone: novoCliente.telefone,
        email: novoCliente.email || undefined,
        tipo: novoCliente.tipo,
        tags: novoCliente.tags.split(',').map((t: string) => t.trim()).filter(Boolean),
        observacoes: novoCliente.observacoes || undefined,
      })
      setModalNovoCliente(false)
      setNovoCliente({ nome: '', telefone: '', email: '', tipo: 'pessoa_fisica', tags: '', observacoes: '' })
      toast.success('Cliente cadastrado com sucesso!')
    } catch (e: any) {
      toast.error(e.message || 'Erro ao cadastrar cliente')
    }
  }

  const handleExcluirCliente = async (id: string) => {
    try {
      await updateCustomer.mutateAsync({ id, data: { status: 'inativo' } })
      setClienteSelecionado(null)
      setModalAberto(false)
      toast.success('Cliente desativado com sucesso!')
    } catch (e: any) {
      toast.error(e.message || 'Erro ao desativar cliente')
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
      >
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-foreground">Clientes</h1>
          <p className="text-muted-foreground">Gerencie sua base de clientes e CRM</p>
        </div>
        <Button onClick={() => setModalNovoCliente(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          Novo Cliente
        </Button>
      </motion.div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total de Clientes', value: estatisticas.total, icon: User },
          { label: 'Clientes Ativos', value: estatisticas.ativos, icon: Star },
          { label: 'Clientes VIP', value: estatisticas.vips, icon: Tag },
          { label: 'Valor Total', value: formatCurrency(estatisticas.valorTotal), icon: DollarSign }
        ].map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 + index * 0.05 }}
          >
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <stat.icon className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{stat.label}</p>
                    <p className="text-xl font-bold text-foreground">{stat.value}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2 }}
      >
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome, telefone ou email..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="flex gap-2">
                <Select value={filtroFrequencia} onValueChange={setFiltroFrequencia}>
                  <SelectTrigger className="w-[140px]">
                    <Filter className="w-4 h-4 mr-2" />
                    <SelectValue placeholder="Frequência" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    <SelectItem value="novo">Novos</SelectItem>
                    <SelectItem value="ocasional">Ocasionais</SelectItem>
                    <SelectItem value="frequente">Frequentes</SelectItem>
                    <SelectItem value="vip">VIP</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={filtroStatus} onValueChange={setFiltroStatus}>
                  <SelectTrigger className="w-[120px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    <SelectItem value="ativo">Ativos</SelectItem>
                    <SelectItem value="inativo">Inativos</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Clients List */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.3 }}
      >
        <Card>
          <CardHeader>
            <CardTitle>Lista de Clientes</CardTitle>
            <CardDescription>
              {clientesFiltrados.length} cliente(s) encontrado(s)
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Cliente</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground hidden md:table-cell">Contato</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground hidden lg:table-cell">Compras</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Frequência</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground hidden sm:table-cell">Última Compra</th>
                    <th className="text-right p-4 text-sm font-medium text-muted-foreground">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {clientesFiltrados.map((cliente) => (
                    <tr 
                      key={cliente.id} 
                      className="border-b border-border hover:bg-muted/30 transition-colors cursor-pointer"
                      onClick={() => {
                        setClienteSelecionado(cliente)
                        setModalAberto(true)
                      }}
                    >
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                            <span className="text-sm font-bold text-primary">
                              {cliente.nome.split(' ').map(n => n[0]).slice(0, 2).join('')}
                            </span>
                          </div>
                          <div>
                            <p className="font-medium text-foreground">{cliente.nome}</p>
                            <p className="text-sm text-muted-foreground">{cliente.tipo === 'pessoa_fisica' ? 'Pessoa Física' : 'Pessoa Jurídica'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-4 hidden md:table-cell">
                        <p className="text-sm text-foreground">{cliente.telefone}</p>
                        {cliente.email && (
                          <p className="text-sm text-muted-foreground truncate max-w-[200px]">{cliente.email}</p>
                        )}
                      </td>
                      <td className="p-4 hidden lg:table-cell">
                        <p className="text-sm font-medium text-foreground">{formatCurrency(cliente.valorTotalGasto)}</p>
                        <p className="text-sm text-muted-foreground">{cliente.totalCompras} pedidos</p>
                      </td>
                      <td className="p-4">
                        <Badge className={frequenciaColors[cliente.frequencia]}>
                          {frequenciaLabels[cliente.frequencia]}
                        </Badge>
                      </td>
                      <td className="p-4 hidden sm:table-cell">
                        <p className="text-sm text-muted-foreground">
                          {cliente.ultimaCompra ? formatDate(new Date(cliente.ultimaCompra)) : 'Nunca'}
                        </p>
                      </td>
                      <td className="p-4 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={(e) => {
                              e.stopPropagation()
                              window.open(`https://wa.me/55${cliente.telefone.replace(/\D/g, '')}`, '_blank')
                            }}>
                              <Phone className="w-4 h-4 mr-2" />
                              WhatsApp
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={(e) => {
                              e.stopPropagation()
                              setClienteSelecionado(cliente)
                              setModalAberto(true)
                            }}>
                              <Edit className="w-4 h-4 mr-2" />
                              Ver Detalhes
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem 
                              className="text-destructive"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleExcluirCliente(cliente.id)
                              }}
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Excluir
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              
              {clientesFiltrados.length === 0 && (
                <div className="text-center py-12">
                  <User className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
                  <p className="text-muted-foreground">Nenhum cliente encontrado</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Client Details Modal */}
      <Dialog open={modalAberto} onOpenChange={setModalAberto}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Detalhes do Cliente</DialogTitle>
            <DialogDescription>
              Informações completas e histórico de interações
            </DialogDescription>
          </DialogHeader>
          
          {clienteSelecionado && (
            <Tabs defaultValue="info" className="flex-1 overflow-hidden flex flex-col">
              <TabsList className="w-full grid grid-cols-3">
                <TabsTrigger value="info">Informações</TabsTrigger>
                <TabsTrigger value="compras">Compras</TabsTrigger>
                <TabsTrigger value="historico">Histórico</TabsTrigger>
              </TabsList>
              
              <ScrollArea className="flex-1 mt-4">
                <TabsContent value="info" className="space-y-4 m-0">
                  <div className="flex items-start gap-4">
                    <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="text-xl font-bold text-primary">
                        {clienteSelecionado.nome.split(' ').map(n => n[0]).slice(0, 2).join('')}
                      </span>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-lg font-bold text-foreground">{clienteSelecionado.nome}</h3>
                        <Badge className={frequenciaColors[clienteSelecionado.frequencia]}>
                          {frequenciaLabels[clienteSelecionado.frequencia]}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Cliente desde {formatDate(new Date(clienteSelecionado.dataCadastro))}
                      </p>
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-sm">
                        <Phone className="w-4 h-4 text-muted-foreground" />
                        <span>{clienteSelecionado.telefone}</span>
                      </div>
                      {clienteSelecionado.email && (
                        <div className="flex items-center gap-2 text-sm">
                          <Mail className="w-4 h-4 text-muted-foreground" />
                          <span>{clienteSelecionado.email}</span>
                        </div>
                      )}
                      {clienteSelecionado.endereco && (
                        <div className="flex items-center gap-2 text-sm">
                          <MapPin className="w-4 h-4 text-muted-foreground" />
                          <span>{clienteSelecionado.endereco.cidade} - {clienteSelecionado.endereco.estado}</span>
                        </div>
                      )}
                    </div>
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-sm">
                        <DollarSign className="w-4 h-4 text-muted-foreground" />
                        <span>Total gasto: {formatCurrency(clienteSelecionado.valorTotalGasto)}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <ShoppingBag className="w-4 h-4 text-muted-foreground" />
                        <span>{clienteSelecionado.totalCompras} compras realizadas</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <Calendar className="w-4 h-4 text-muted-foreground" />
                        <span>Última compra: {clienteSelecionado.ultimaCompra ? formatDate(new Date(clienteSelecionado.ultimaCompra)) : 'Nunca'}</span>
                      </div>
                    </div>
                  </div>

                  {clienteSelecionado.tags.length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-foreground mb-2">Tags</p>
                      <div className="flex flex-wrap gap-2">
                        {clienteSelecionado.tags.map(tag => (
                          <Badge key={tag} variant="outline">{tag}</Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {clienteSelecionado.observacoes && (
                    <div>
                      <p className="text-sm font-medium text-foreground mb-2">Observações</p>
                      <p className="text-sm text-muted-foreground">{clienteSelecionado.observacoes}</p>
                    </div>
                  )}

                  <div className="pt-4 flex gap-2">
                    <Button className="flex-1 gap-2" asChild>
                      <a 
                        href={`https://wa.me/55${clienteSelecionado.telefone.replace(/\D/g, '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Phone className="w-4 h-4" />
                        Chamar no WhatsApp
                      </a>
                    </Button>
                  </div>
                </TabsContent>

                <TabsContent value="compras" className="m-0">
                  <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div className="p-4 rounded-lg bg-secondary/50">
                        <p className="text-2xl font-bold text-foreground">{clienteSelecionado.totalCompras}</p>
                        <p className="text-sm text-muted-foreground">Compras</p>
                      </div>
                      <div className="p-4 rounded-lg bg-secondary/50">
                        <p className="text-2xl font-bold text-foreground">{formatCurrency(clienteSelecionado.valorTotalGasto)}</p>
                        <p className="text-sm text-muted-foreground">Total Gasto</p>
                      </div>
                      <div className="p-4 rounded-lg bg-secondary/50">
                        <p className="text-2xl font-bold text-foreground">
                          {clienteSelecionado.totalCompras > 0 
                            ? formatCurrency(clienteSelecionado.valorTotalGasto / clienteSelecionado.totalCompras)
                            : 'R$ 0'}
                        </p>
                        <p className="text-sm text-muted-foreground">Ticket Médio</p>
                      </div>
                    </div>

                    <div>
                      <p className="text-sm font-medium text-foreground mb-2">Categorias Favoritas</p>
                      <div className="flex flex-wrap gap-2">
                        {clienteSelecionado.preferencias.categoriasFavoritas.length > 0 ? (
                          clienteSelecionado.preferencias.categoriasFavoritas.map(cat => (
                            <Badge key={cat} variant="secondary">{cat}</Badge>
                          ))
                        ) : (
                          <p className="text-sm text-muted-foreground">Nenhuma categoria registrada</p>
                        )}
                      </div>
                    </div>

                    <div>
                      <p className="text-sm font-medium text-foreground mb-2">Marcas Favoritas</p>
                      <div className="flex flex-wrap gap-2">
                        {clienteSelecionado.preferencias.marcasFavoritas.length > 0 ? (
                          clienteSelecionado.preferencias.marcasFavoritas.map(marca => (
                            <Badge key={marca} variant="outline">{marca}</Badge>
                          ))
                        ) : (
                          <p className="text-sm text-muted-foreground">Nenhuma marca registrada</p>
                        )}
                      </div>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="historico" className="m-0">
                  <div className="space-y-3">
                    {clienteSelecionado.historicoInteracoes.length > 0 ? (
                      clienteSelecionado.historicoInteracoes.map(interacao => (
                        <div key={interacao.id} className="flex items-start gap-3 p-3 rounded-lg bg-secondary/50">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                            interacao.tipo === 'compra' ? 'bg-success/10' :
                            interacao.tipo === 'whatsapp' ? 'bg-primary/10' : 'bg-info/10'
                          }`}>
                            {interacao.tipo === 'compra' ? (
                              <ShoppingBag className="w-4 h-4 text-success" />
                            ) : interacao.tipo === 'whatsapp' ? (
                              <Phone className="w-4 h-4 text-primary" />
                            ) : (
                              <MessageSquare className="w-4 h-4 text-info" />
                            )}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm font-medium text-foreground capitalize">{interacao.tipo}</span>
                              <Badge variant="outline" className="text-xs">
                                {interacao.atendidoPor === 'ia' ? 'IA' : 'Humano'}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">{interacao.resumo}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {formatDate(new Date(interacao.data))}
                            </p>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-8">
                        <Clock className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
                        <p className="text-muted-foreground">Nenhum histórico registrado</p>
                      </div>
                    )}
                  </div>
                </TabsContent>
              </ScrollArea>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>

      {/* New Client Modal */}
      <Dialog open={modalNovoCliente} onOpenChange={setModalNovoCliente}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo Cliente</DialogTitle>
            <DialogDescription>
              Cadastre um novo cliente no sistema
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nome">Nome *</Label>
              <Input
                id="nome"
                placeholder="Nome completo do cliente"
                value={novoCliente.nome}
                onChange={(e) => setNovoCliente(prev => ({ ...prev, nome: e.target.value }))}
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="telefone">Telefone *</Label>
                <Input
                  id="telefone"
                  placeholder="(31) 99999-9999"
                  value={novoCliente.telefone}
                  onChange={(e) => setNovoCliente(prev => ({ ...prev, telefone: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tipo">Tipo</Label>
                <Select 
                  value={novoCliente.tipo} 
                  onValueChange={(value: 'pessoa_fisica' | 'pessoa_juridica') => 
                    setNovoCliente(prev => ({ ...prev, tipo: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pessoa_fisica">Pessoa Física</SelectItem>
                    <SelectItem value="pessoa_juridica">Pessoa Jurídica</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="email@exemplo.com"
                value={novoCliente.email}
                onChange={(e) => setNovoCliente(prev => ({ ...prev, email: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tags">Tags (separadas por vírgula)</Label>
              <Input
                id="tags"
                placeholder="pet_lover, vip, produtor"
                value={novoCliente.tags}
                onChange={(e) => setNovoCliente(prev => ({ ...prev, tags: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="observacoes">Observações</Label>
              <Textarea
                id="observacoes"
                placeholder="Observações sobre o cliente..."
                value={novoCliente.observacoes}
                onChange={(e) => setNovoCliente(prev => ({ ...prev, observacoes: e.target.value }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setModalNovoCliente(false)}>
              Cancelar
            </Button>
            <Button onClick={handleNovoCliente}>
              Cadastrar Cliente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
