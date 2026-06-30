"""
AgroRaiz - Database Models
Multi-tenant schema. Mirrors frontend lib/types.ts exactly.
"""
import uuid
from datetime import datetime
from typing import Optional
import enum

from sqlalchemy import (
    Boolean, Column, DateTime, Enum as SAEnum, Float,
    ForeignKey, Index, Integer, JSON, String, Text, UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.core.database import Base


# ─── Helpers ─────────────────────────────────────────────────────────────────

def uuid_pk():
    return Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)



def fk(table_col: str, **kw):
    return Column(UUID(as_uuid=True), ForeignKey(table_col, ondelete="CASCADE"), **kw)


# ─── Enums ────────────────────────────────────────────────────────────────────

class UserRole(str, enum.Enum):
    OWNER = "owner"
    ADMIN = "admin"
    ATTENDANT = "attendant"
    VIEWER = "viewer"


class CustomerFrequency(str, enum.Enum):
    NOVO = "novo"
    OCASIONAL = "ocasional"
    FREQUENTE = "frequente"
    VIP = "vip"


class CustomerStatus(str, enum.Enum):
    ATIVO = "ativo"
    INATIVO = "inativo"
    BLOQUEADO = "bloqueado"


class ConversationStatus(str, enum.Enum):
    IA = "ia"
    AGUARDANDO_HUMANO = "aguardando_humano"
    HUMANO = "humano"
    FINALIZADA = "finalizada"


class ConversationChannel(str, enum.Enum):
    WHATSAPP = "whatsapp"
    INSTAGRAM = "instagram"


class Priority(str, enum.Enum):
    BAIXA = "baixa"
    MEDIA = "media"
    ALTA = "alta"
    URGENTE = "urgente"


class Sentiment(str, enum.Enum):
    POSITIVO = "positivo"
    NEUTRO = "neutro"
    NEGATIVO = "negativo"


class MessageSender(str, enum.Enum):
    CLIENTE = "cliente"
    IA = "ia"
    ATENDENTE = "atendente"


class CampaignStatus(str, enum.Enum):
    RASCUNHO = "rascunho"
    AGENDADA = "agendada"
    ATIVA = "ativa"
    PAUSADA = "pausada"
    FINALIZADA = "finalizada"


class ConfirmacaoStatus(str, enum.Enum):
    CONFIRMADO = "confirmado"
    PENDENTE = "pendente"
    CRITICO = "critico"      # >30 dias sem confirmação


class OrderStatus(str, enum.Enum):
    PENDENTE = "pendente"
    CONFIRMADA = "confirmada"
    EM_SEPARACAO = "em_separacao"
    ENTREGUE = "entregue"
    CANCELADA = "cancelada"


# ─── Store (Multi-tenant root) ────────────────────────────────────────────────

class Store(Base):
    __tablename__ = "stores"

    id = uuid_pk()
    name = Column(String(200), nullable=False)
    slug = Column(String(100), unique=True, nullable=False)
    phone = Column(String(20))
    whatsapp = Column(String(20))
    instagram = Column(String(100))
    email = Column(String(255))
    city = Column(String(200))
    state = Column(String(2))
    logo_url = Column(String(500))
    plan = Column(String(50), default="starter")
    active = Column(Boolean, default=True)
    settings = Column(JSON, default=dict)
    ai_config = Column(JSON, default=dict)  # persona, horario, etc.
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    users = relationship("User", back_populates="store", lazy="selectin")
    customers = relationship("Customer", back_populates="store")
    products = relationship("Product", back_populates="store")
    conversations = relationship("Conversation", back_populates="store")
    campaigns = relationship("Campaign", back_populates="store")


# ─── Users ───────────────────────────────────────────────────────────────────

class User(Base):
    __tablename__ = "users"

    id = uuid_pk()
    store_id = fk("stores.id", nullable=False)
    email = Column(String(255), unique=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    name = Column(String(200), nullable=False)
    role = Column(SAEnum(UserRole), default=UserRole.ATTENDANT, nullable=False)
    avatar_url = Column(String(500))
    active = Column(Boolean, default=True)
    last_login = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    store = relationship("Store", back_populates="users")

    __table_args__ = (Index("ix_users_store_email", "store_id", "email"),)


# ─── Customers (CRM) ─────────────────────────────────────────────────────────

class Customer(Base):
    __tablename__ = "customers"

    id = uuid_pk()
    store_id = fk("stores.id", nullable=False)
    phone = Column(String(20), nullable=False)
    name = Column(String(200))
    email = Column(String(255))
    cpf = Column(String(14))
    tipo = Column(String(20), default="pessoa_fisica")
    status = Column(SAEnum(CustomerStatus), default=CustomerStatus.ATIVO)
    frequencia = Column(SAEnum(CustomerFrequency), default=CustomerFrequency.NOVO)
    tags = Column(JSON, default=list)
    observacoes = Column(Text)
    total_compras = Column(Integer, default=0)
    valor_total_gasto = Column(Float, default=0.0)
    endereco = Column(JSON, default=dict)
    preferencias = Column(JSON, default=dict)
    ultima_compra = Column(DateTime)
    ultimo_contato = Column(DateTime)
    whatsapp_opt_in = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("store_id", "phone", name="uq_customer_store_phone"),
        Index("ix_customers_store_phone", "store_id", "phone"),
    )

    store = relationship("Store", back_populates="customers")
    conversations = relationship("Conversation", back_populates="customer")
    interactions = relationship("CustomerInteraction", back_populates="customer", order_by="CustomerInteraction.created_at.desc()")
    orders = relationship("Order", back_populates="customer")


class CustomerInteraction(Base):
    __tablename__ = "customer_interactions"

    id = uuid_pk()
    customer_id = fk("customers.id", nullable=False)
    tipo = Column(String(50))  # whatsapp, instagram, ligacao, visita, compra
    resumo = Column(Text)
    sentimento = Column(SAEnum(Sentiment))
    atendido_por = Column(String(20), default="ia")  # ia | humano
    ai_response = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)

    customer = relationship("Customer", back_populates="interactions")


# ─── Products / Inventory ─────────────────────────────────────────────────────

class ProductCategory(Base):
    __tablename__ = "product_categories"

    id = uuid_pk()
    store_id = fk("stores.id", nullable=False)
    name = Column(String(200), nullable=False)
    slug = Column(String(100), nullable=False)
    parent_id = Column(UUID(as_uuid=True), ForeignKey("product_categories.id"))
    icon = Column(String(100))
    active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class Product(Base):
    __tablename__ = "products"

    id = uuid_pk()
    store_id = fk("stores.id", nullable=False)
    category_id = Column(UUID(as_uuid=True), ForeignKey("product_categories.id"))
    nome = Column(String(300), nullable=False)
    descricao = Column(Text)
    categoria = Column(String(100))
    subcategoria = Column(String(100))
    marca = Column(String(100))
    sku = Column(String(100))
    codigo_barras = Column(String(100))
    preco = Column(Float, nullable=False)
    preco_promocional = Column(Float)
    custo_medio = Column(Float, default=0.0)
    unidade = Column(String(20), default="un")
    estoque = Column(Integer, default=0)
    estoque_minimo = Column(Integer, default=5)
    estoque_maximo = Column(Integer, default=100)
    localizacao = Column(String(100))
    fornecedor = Column(String(200))
    imagens = Column(JSON, default=list)
    tags = Column(JSON, default=list)
    ativo = Column(Boolean, default=True)
    destaque = Column(Boolean, default=False)
    ai_descricao = Column(Text)  # Description optimized by AI for sales

    # ─── Stock confirmation tracking ─────────────────────────────────────────
    data_ultima_confirmacao = Column(DateTime)
    confirmado_por = Column(String(200))   # user name or "admin_whatsapp"
    status_confirmacao = Column(
        SAEnum(ConfirmacaoStatus), default=ConfirmacaoStatus.PENDENTE
    )
    historico_confirmacoes = Column(JSON, default=list)  # [{data, por, status}]
    consultas_semana = Column(Integer, default=0)   # reset weekly by Beat
    consultas_total = Column(Integer, default=0)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    store = relationship("Store", back_populates="products")

    __table_args__ = (Index("ix_products_store_ativo", "store_id", "ativo"),)


# ─── Conversations ────────────────────────────────────────────────────────────

class Conversation(Base):
    __tablename__ = "conversations"

    id = uuid_pk()
    store_id = fk("stores.id", nullable=False)
    customer_id = Column(UUID(as_uuid=True), ForeignKey("customers.id"))
    channel = Column(SAEnum(ConversationChannel), default=ConversationChannel.WHATSAPP)
    status = Column(SAEnum(ConversationStatus), default=ConversationStatus.IA)
    prioridade = Column(SAEnum(Priority), default=Priority.MEDIA)
    sentimento = Column(SAEnum(Sentiment), default=Sentiment.NEUTRO)
    assunto = Column(String(300))
    motivo_transferencia = Column(String(200))
    assigned_to = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    resolved_at = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    store = relationship("Store", back_populates="conversations")
    customer = relationship("Customer", back_populates="conversations")
    messages = relationship("Message", back_populates="conversation", order_by="Message.created_at")

    __table_args__ = (
        Index("ix_conv_store_status", "store_id", "status"),
        Index("ix_conv_store_updated", "store_id", "updated_at"),
    )


class Message(Base):
    __tablename__ = "messages"

    id = uuid_pk()
    conversation_id = fk("conversations.id", nullable=False)
    conteudo = Column(Text, nullable=False)
    tipo = Column(String(20), default="texto")  # texto, imagem, audio, documento
    remetente = Column(SAEnum(MessageSender), nullable=False)
    lida = Column(Boolean, default=False)
    status = Column(String(20), default="sent")  # sent, delivered, read, failed
    external_id = Column(String(100))
    extra_data = Column(JSON, default=dict)
    created_at = Column(DateTime, default=datetime.utcnow)

    conversation = relationship("Conversation", back_populates="messages")


# ─── Orders ──────────────────────────────────────────────────────────────────

class Order(Base):
    __tablename__ = "orders"

    id = uuid_pk()
    store_id = fk("stores.id", nullable=False)
    customer_id = fk("customers.id", nullable=False)
    status = Column(SAEnum(OrderStatus), default=OrderStatus.PENDENTE)
    subtotal = Column(Float, nullable=False)
    desconto = Column(Float, default=0.0)
    total = Column(Float, nullable=False)
    forma_pagamento = Column(String(30))
    canal_origem = Column(String(20), default="whatsapp")
    observacoes = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    customer = relationship("Customer", back_populates="orders")
    items = relationship("OrderItem", back_populates="order")


class OrderItem(Base):
    __tablename__ = "order_items"

    id = uuid_pk()
    order_id = fk("orders.id", nullable=False)
    product_id = Column(UUID(as_uuid=True), ForeignKey("products.id"))
    nome_produto = Column(String(300))  # snapshot at time of sale
    quantidade = Column(Integer, nullable=False)
    preco_unitario = Column(Float, nullable=False)
    desconto = Column(Float, default=0.0)
    subtotal = Column(Float, nullable=False)

    order = relationship("Order", back_populates="items")
    product = relationship("Product")


# ─── Campaigns ───────────────────────────────────────────────────────────────

class Campaign(Base):
    __tablename__ = "campaigns"

    id = uuid_pk()
    store_id = fk("stores.id", nullable=False)
    nome = Column(String(200), nullable=False)
    tipo = Column(String(50))  # promocao, reengajamento, novidades, sazonal, aniversario
    canais = Column(JSON, default=list)  # ["whatsapp", "instagram"]
    mensagem = Column(Text, nullable=False)
    imagem_url = Column(String(500))
    segmento = Column(JSON, default=dict)
    status = Column(SAEnum(CampaignStatus), default=CampaignStatus.RASCUNHO)
    data_inicio = Column(DateTime)
    data_fim = Column(DateTime)
    agendado_para = Column(DateTime)
    # Metrics
    total_destinatarios = Column(Integer, default=0)
    enviados = Column(Integer, default=0)
    entregues = Column(Integer, default=0)
    lidos = Column(Integer, default=0)
    conversoes = Column(Integer, default=0)
    valor_gerado = Column(Float, default=0.0)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    store = relationship("Store", back_populates="campaigns")


# ─── AI Sessions (Redis-backed, persisted for audit) ─────────────────────────

class AISession(Base):
    __tablename__ = "ai_sessions"

    id = uuid_pk()
    store_id = fk("stores.id", nullable=False)
    customer_phone = Column(String(20), nullable=False)
    conversation_id = Column(UUID(as_uuid=True), ForeignKey("conversations.id"))
    total_messages = Column(Integer, default=0)
    frustration_count = Column(Integer, default=0)
    human_takeover = Column(Boolean, default=False)
    takeover_reason = Column(String(100))
    takeover_at = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# ─── Audit Log ───────────────────────────────────────────────────────────────

class AuditLog(Base):
    """Immutable audit trail for all stock and AI changes."""
    __tablename__ = "audit_logs"

    id = uuid_pk()
    store_id = fk("stores.id", nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    user_name = Column(String(200))   # snapshot (user may be deleted)
    action = Column(String(100), nullable=False)    # e.g. "stock_confirmed"
    entity_type = Column(String(50))               # "product", "conversation", etc.
    entity_id = Column(String(100))                # UUID of affected entity
    entity_name = Column(String(300))              # human-readable snapshot
    old_value = Column(JSON)
    new_value = Column(JSON)
    source = Column(String(50), default="manual")  # manual | ai | whatsapp_admin
    ip_address = Column(String(50))
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (Index("ix_audit_store_created", "store_id", "created_at"),)


# ─── Product Consultation Tracking ───────────────────────────────────────────

class ProductConsultation(Base):
    """
    Records every time the AI uses a product in a customer response.
    Used for ranking: most consulted, most asked about.
    """
    __tablename__ = "product_consultations"

    id = uuid_pk()
    store_id = fk("stores.id", nullable=False)
    product_id = Column(UUID(as_uuid=True), ForeignKey("products.id", ondelete="SET NULL"))
    product_nome = Column(String(300))   # snapshot
    customer_phone = Column(String(20))
    channel = Column(String(20), default="whatsapp")
    resulted_in_sale = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (Index("ix_consult_store_product", "store_id", "product_id"),)


# ─── Weekly Report ────────────────────────────────────────────────────────────

class WeeklyReport(Base):
    """Stores generated weekly reports for display in dashboard."""
    __tablename__ = "weekly_reports"

    id = uuid_pk()
    store_id = fk("stores.id", nullable=False)
    week_start = Column(DateTime, nullable=False)
    week_end = Column(DateTime, nullable=False)
    data = Column(JSON, nullable=False)   # full report payload
    sent_whatsapp = Column(Boolean, default=False)
    sent_at = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (Index("ix_report_store_week", "store_id", "week_start"),)
