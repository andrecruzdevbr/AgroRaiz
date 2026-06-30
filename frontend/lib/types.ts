// Tipos base do sistema Agro Raiz

// === CLIENTES ===
export interface Cliente {
  id: string
  nome: string
  telefone: string
  email?: string
  cpf?: string
  endereco?: Endereco
  tipo: 'pessoa_fisica' | 'pessoa_juridica'
  tags: string[]
  observacoes?: string
  dataCadastro: Date
  ultimaCompra?: Date
  totalCompras: number
  valorTotalGasto: number
  frequencia: 'novo' | 'ocasional' | 'frequente' | 'vip'
  status: 'ativo' | 'inativo' | 'bloqueado'
  preferencias: Preferencias
  historicoInteracoes: Interacao[]
}

export interface Endereco {
  cep: string
  logradouro: string
  numero: string
  complemento?: string
  bairro: string
  cidade: string
  estado: string
}

export interface Preferencias {
  categoriasFavoritas: string[]
  marcasFavoritas: string[]
  frequenciaContato: 'diario' | 'semanal' | 'quinzenal' | 'mensal'
  canalPreferido: 'whatsapp' | 'instagram' | 'telefone' | 'email'
  aceitaPromocoes: boolean
}

export interface Interacao {
  id: string
  tipo: 'whatsapp' | 'instagram' | 'ligacao' | 'visita' | 'compra'
  data: Date
  resumo: string
  atendidoPor: 'ia' | 'humano'
  sentimento?: 'positivo' | 'neutro' | 'negativo'
}

// === PRODUTOS ===
export interface Produto {
  id: string
  nome: string
  descricao: string
  categoria: CategoriaProduto
  subcategoria?: string | null
  marca: string
  sku: string
  codigo_barras?: string | null
  preco: number
  preco_promocional?: number | null
  custo_medio: number
  unidade: string
  estoque: number
  estoque_minimo: number
  estoque_maximo: number
  estoque_status: 'normal' | 'baixo' | 'critico'
  localizacao?: string | null
  fornecedor?: string | null
  imagens: string[]
  ativo: boolean
  destaque: boolean
  tags: string[]
  margem: number
  updated_at: string | null
}

export type CategoriaProduto = 
  | 'racoes_caes'
  | 'racoes_gatos'
  | 'racoes_aves'
  | 'racoes_peixes'
  | 'racoes_equinos'
  | 'racoes_bovinos'
  | 'racoes_suinos'
  | 'medicamentos'
  | 'higiene_pet'
  | 'acessorios_pet'
  | 'sementes'
  | 'fertilizantes'
  | 'defensivos'
  | 'ferramentas'
  | 'equipamentos'
  | 'outros'

export const CATEGORIAS_LABELS: Record<CategoriaProduto, string> = {
  racoes_caes: 'Rações para Cães',
  racoes_gatos: 'Rações para Gatos',
  racoes_aves: 'Rações para Aves',
  racoes_peixes: 'Rações para Peixes',
  racoes_equinos: 'Rações para Equinos',
  racoes_bovinos: 'Rações para Bovinos',
  racoes_suinos: 'Rações para Suínos',
  medicamentos: 'Medicamentos Veterinários',
  higiene_pet: 'Higiene Pet',
  acessorios_pet: 'Acessórios Pet',
  sementes: 'Sementes',
  fertilizantes: 'Fertilizantes',
  defensivos: 'Defensivos Agrícolas',
  ferramentas: 'Ferramentas',
  equipamentos: 'Equipamentos',
  outros: 'Outros',
}

// === VENDAS ===
export interface Venda {
  id: string
  clienteId: string
  cliente?: Cliente
  itens: ItemVenda[]
  subtotal: number
  desconto: number
  total: number
  formaPagamento: FormaPagamento
  status: StatusVenda
  observacoes?: string
  dataVenda: Date
  vendedorId?: string
  canalOrigem: 'loja' | 'whatsapp' | 'instagram'
}

export interface ItemVenda {
  produtoId: string
  produto?: Produto
  quantidade: number
  precoUnitario: number
  desconto: number
  subtotal: number
}

export type FormaPagamento = 'dinheiro' | 'pix' | 'cartao_credito' | 'cartao_debito' | 'boleto' | 'fiado'
export type StatusVenda = 'pendente' | 'confirmada' | 'em_separacao' | 'entregue' | 'cancelada'

// === CAMPANHAS ===
export interface Campanha {
  id: string
  nome: string
  tipo: 'promocao' | 'reengajamento' | 'novidades' | 'sazonal' | 'aniversario'
  canais: ('whatsapp' | 'instagram')[]
  mensagem: string
  imagem?: string
  segmento: SegmentoCampanha
  dataInicio: Date
  dataFim: Date
  status: 'rascunho' | 'agendada' | 'ativa' | 'pausada' | 'finalizada'
  metricas: MetricasCampanha
}

export interface SegmentoCampanha {
  frequencia?: Cliente['frequencia'][]
  ultimaCompraDias?: number
  categorias?: CategoriaProduto[]
  valorMinimoGasto?: number
  tags?: string[]
}

export interface MetricasCampanha {
  enviados: number
  entregues: number
  lidos: number
  cliques: number
  conversoes: number
  valorGerado: number
}

// === CONVERSAS / IA ===
export interface Conversa {
  id: string
  clienteId: string
  cliente?: Cliente
  canal: 'whatsapp' | 'instagram'
  mensagens: Mensagem[]
  status: 'ia' | 'aguardando_humano' | 'humano' | 'finalizada'
  prioridade: 'baixa' | 'media' | 'alta' | 'urgente'
  assunto?: string
  sentimento: 'positivo' | 'neutro' | 'negativo'
  dataInicio: Date
  dataUltimaAtualizacao: Date
  motivoTransferencia?: string
}

export interface Mensagem {
  id: string
  conteudo: string
  tipo: 'texto' | 'imagem' | 'audio' | 'documento'
  remetente: 'cliente' | 'ia' | 'atendente'
  timestamp: Date
  lida: boolean
  metadata?: Record<string, unknown>
}

// === DASHBOARD / ANALYTICS ===
export interface DashboardData {
  resumoDiario: {
    vendas: number
    valorVendas: number
    novosClientes: number
    conversas: number
    conversasIA: number
    taxaConversao: number
  }
  vendasPorCategoria: { categoria: string; valor: number; quantidade: number }[]
  vendasPorPeriodo: { data: string; valor: number }[]
  topProdutos: { produto: Produto; quantidade: number; valor: number }[]
  clientesRecuperados: number
  mensagensPorCanal: { canal: string; total: number; respondidas: number }[]
  estoqueAlertas: { produto: Produto; situacao: 'critico' | 'baixo' }[]
}

// === CONFIGURAÇÕES ===
export interface Configuracoes {
  loja: {
    nome: string
    telefone: string
    whatsapp: string
    email?: string
    endereco: Endereco
    horarioFuncionamento: string
    instagram: string
  }
  ia: {
    ativa: boolean
    personalidade: string
    saudacao: string
    despedida: string
    limiteMensagensAntesHumano: number
    palavrasChaveTransferencia: string[]
    respostaForaHorario: string
  }
  notificacoes: {
    novoPedido: boolean
    estoqueBaixo: boolean
    clienteInativo: boolean
    conversaAguardando: boolean
  }
}

// === UTILITÁRIOS ===
export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface Filtros {
  busca?: string
  categoria?: string
  status?: string
  dataInicio?: Date
  dataFim?: Date
  ordenarPor?: string
  ordem?: 'asc' | 'desc'
}
