"""
AgroRaiz - Stock Monitoring Service
IA operacional de estoque: confirmação automática, alertas,
ranking de produtos e relatório gerencial semanal.
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta
from typing import Optional
from uuid import UUID

from sqlalchemy import select, func, and_, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.logging import get_logger
from app.models.models import (
    Product, ProductConsultation, AuditLog,
    WeeklyReport, ConfirmacaoStatus, Conversation, CustomerInteraction,
)

logger = get_logger(__name__)

# Produtos não confirmados há mais de 30 dias → resposta cautelosa da IA
CONFIRMATION_CRITICAL_DAYS = 30

# Produtos não confirmados há mais de 7 dias → alerta no dashboard
CONFIRMATION_WARN_DAYS = 7


class StockMonitoringService:
    """
    Gerencia o ciclo de confirmação de estoque:
    - Monitora status de confirmação de cada produto
    - Gera resumo semanal para o admin via WhatsApp
    - Interpreta respostas do admin ("SIM", "TODOS DISPONÍVEIS", etc.)
    - Registra auditoria de todas as alterações
    - Gera ranking de produtos mais consultados / vendidos
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    # ─── Confirmation Status ──────────────────────────────────────────────────

    async def get_products_needing_confirmation(
        self, store_id: UUID
    ) -> dict[str, list]:
        """
        Returns products grouped by confirmation urgency.
        - critical: >30 days without confirmation
        - warning: 7-30 days without confirmation
        - pending: never confirmed
        """
        now = datetime.utcnow()
        critical_cutoff = now - timedelta(days=CONFIRMATION_CRITICAL_DAYS)
        warn_cutoff = now - timedelta(days=CONFIRMATION_WARN_DAYS)

        result = await self.db.execute(
            select(Product).where(
                and_(Product.store_id == store_id, Product.ativo == True)
            )
        )
        products = result.scalars().all()

        critical, warning, ok = [], [], []

        for p in products:
            if p.data_ultima_confirmacao is None:
                critical.append(p)
            elif p.data_ultima_confirmacao < critical_cutoff:
                critical.append(p)
            elif p.data_ultima_confirmacao < warn_cutoff:
                warning.append(p)
            else:
                ok.append(p)

        return {"critical": critical, "warning": warning, "ok": ok}

    async def confirm_product(
        self,
        product_id: UUID,
        store_id: UUID,
        confirmed_by: str,
        source: str = "manual",
        new_stock: Optional[int] = None,
        user_id: Optional[UUID] = None,
    ) -> Product:
        """Confirm a product's availability. Logs audit trail."""
        result = await self.db.execute(
            select(Product).where(
                and_(Product.id == product_id, Product.store_id == store_id)
            )
        )
        product = result.scalar_one_or_none()
        if not product:
            raise ValueError(f"Product {product_id} not found")

        old_stock = product.estoque
        now = datetime.utcnow()

        # Update confirmation fields
        history = product.historico_confirmacoes or []
        history.append({
            "data": now.isoformat(),
            "por": confirmed_by,
            "status": "confirmado",
            "estoque": new_stock if new_stock is not None else product.estoque,
            "fonte": source,
        })
        # Keep last 50 entries
        history = history[-50:]

        await self.db.execute(
            update(Product)
            .where(Product.id == product_id)
            .values(
                data_ultima_confirmacao=now,
                confirmado_por=confirmed_by,
                status_confirmacao=ConfirmacaoStatus.CONFIRMADO,
                historico_confirmacoes=history,
                estoque=new_stock if new_stock is not None else Product.estoque,
                updated_at=now,
            )
        )

        # Audit log
        await self._write_audit(
            store_id=store_id,
            user_id=user_id,
            user_name=confirmed_by,
            action="stock_confirmed",
            entity_type="product",
            entity_id=str(product_id),
            entity_name=product.nome,
            old_value={"estoque": old_stock, "status_confirmacao": str(product.status_confirmacao)},
            new_value={"estoque": new_stock or old_stock, "status_confirmacao": "confirmado"},
            source=source,
        )

        logger.info(
            "stock_confirmed",
            product=product.nome,
            by=confirmed_by,
            source=source,
        )
        return product

    async def confirm_all_products(
        self,
        store_id: UUID,
        confirmed_by: str,
        source: str = "whatsapp_admin",
    ) -> int:
        """Bulk confirm all active products. Returns count confirmed."""
        now = datetime.utcnow()

        result = await self.db.execute(
            select(Product).where(
                and_(Product.store_id == store_id, Product.ativo == True)
            )
        )
        products = result.scalars().all()
        count = 0

        for p in products:
            history = p.historico_confirmacoes or []
            history.append({
                "data": now.isoformat(),
                "por": confirmed_by,
                "status": "confirmado_em_massa",
                "fonte": source,
            })
            await self.db.execute(
                update(Product)
                .where(Product.id == p.id)
                .values(
                    data_ultima_confirmacao=now,
                    confirmado_por=confirmed_by,
                    status_confirmacao=ConfirmacaoStatus.CONFIRMADO,
                    historico_confirmacoes=history[-50:],
                    updated_at=now,
                )
            )
            count += 1

        await self._write_audit(
            store_id=store_id,
            user_name=confirmed_by,
            action="stock_confirmed_bulk",
            entity_type="product",
            entity_id="all",
            entity_name=f"Todos os produtos ({count})",
            old_value=None,
            new_value={"count": count},
            source=source,
        )

        logger.info("stock_confirmed_bulk", by=confirmed_by, count=count, source=source)
        return count

    # ─── Consultation Tracking ────────────────────────────────────────────────

    async def record_consultation(
        self,
        store_id: UUID,
        product_id: UUID,
        product_nome: str,
        customer_phone: str,
        channel: str = "whatsapp",
    ) -> None:
        """Called by AI service every time a product is shown to a customer."""
        # Insert consultation record
        consultation = ProductConsultation(
            store_id=store_id,
            product_id=product_id,
            product_nome=product_nome,
            customer_phone=customer_phone,
            channel=channel,
        )
        self.db.add(consultation)

        # Increment counters on product
        await self.db.execute(
            update(Product)
            .where(Product.id == product_id)
            .values(
                consultas_semana=Product.consultas_semana + 1,
                consultas_total=Product.consultas_total + 1,
            )
        )

    async def mark_consultation_as_sale(
        self, store_id: UUID, product_id: UUID, customer_phone: str
    ) -> None:
        """Mark a recent consultation as resulting in a sale."""
        await self.db.execute(
            update(ProductConsultation)
            .where(
                and_(
                    ProductConsultation.store_id == store_id,
                    ProductConsultation.product_id == product_id,
                    ProductConsultation.customer_phone == customer_phone,
                    ProductConsultation.resulted_in_sale == False,
                )
            )
            .values(resulted_in_sale=True)
        )

    # ─── Rankings ─────────────────────────────────────────────────────────────

    async def get_product_rankings(self, store_id: UUID) -> dict:
        """
        Returns product rankings for dashboard and weekly report.
        """
        # Most consulted (total)
        most_consulted = await self.db.execute(
            select(Product)
            .where(and_(Product.store_id == store_id, Product.ativo == True))
            .order_by(Product.consultas_total.desc())
            .limit(10)
        )

        # Most consulted this week
        most_consulted_week = await self.db.execute(
            select(Product)
            .where(and_(Product.store_id == store_id, Product.ativo == True))
            .order_by(Product.consultas_semana.desc())
            .limit(10)
        )

        # Least sold / least consulted (risk of rupture)
        possible_rupture = await self.db.execute(
            select(Product)
            .where(
                and_(
                    Product.store_id == store_id,
                    Product.ativo == True,
                    Product.estoque <= Product.estoque_minimo,
                )
            )
            .order_by(Product.estoque)
            .limit(10)
        )

        # Unconfirmed (critical)
        cutoff = datetime.utcnow() - timedelta(days=CONFIRMATION_CRITICAL_DAYS)
        unconfirmed = await self.db.execute(
            select(Product)
            .where(
                and_(
                    Product.store_id == store_id,
                    Product.ativo == True,
                    (Product.data_ultima_confirmacao == None)
                    | (Product.data_ultima_confirmacao < cutoff),
                )
            )
            .limit(20)
        )

        def serialize(p: Product) -> dict:
            return {
                "id": str(p.id),
                "nome": p.nome,
                "categoria": p.categoria,
                "estoque": p.estoque,
                "preco": p.preco,
                "consultas_semana": p.consultas_semana,
                "consultas_total": p.consultas_total,
                "data_ultima_confirmacao": (
                    p.data_ultima_confirmacao.isoformat()
                    if p.data_ultima_confirmacao else None
                ),
                "status_confirmacao": (
                    p.status_confirmacao.value if p.status_confirmacao else "pendente"
                ),
                "dias_sem_confirmacao": (
                    (datetime.utcnow() - p.data_ultima_confirmacao).days
                    if p.data_ultima_confirmacao else 999
                ),
            }

        return {
            "mais_consultados": [serialize(p) for p in most_consulted.scalars().all()],
            "mais_consultados_semana": [serialize(p) for p in most_consulted_week.scalars().all()],
            "risco_ruptura": [serialize(p) for p in possible_rupture.scalars().all()],
            "sem_confirmacao": [serialize(p) for p in unconfirmed.scalars().all()],
        }

    # ─── Weekly Summary for WhatsApp ─────────────────────────────────────────

    async def generate_weekly_summary(self, store_id: UUID) -> dict:
        """
        Generate the weekly summary to be sent to admin via WhatsApp.
        Returns structured data + formatted message.
        """
        since = datetime.utcnow() - timedelta(days=7)

        # Top 5 most consulted this week
        top_consulted = await self.db.execute(
            select(Product)
            .where(
                and_(
                    Product.store_id == store_id,
                    Product.ativo == True,
                    Product.consultas_semana > 0,
                )
            )
            .order_by(Product.consultas_semana.desc())
            .limit(5)
        )
        top_products = list(top_consulted.scalars().all())

        # New customers this week
        from app.models.models import Customer
        new_customers = await self.db.scalar(
            select(func.count(Customer.id)).where(
                and_(Customer.store_id == store_id, Customer.created_at >= since)
            )
        ) or 0

        # Conversations this week
        total_atendimentos = await self.db.scalar(
            select(func.count(Conversation.id)).where(
                and_(Conversation.store_id == store_id, Conversation.created_at >= since)
            )
        ) or 0

        # Unconfirmed products
        unconfirmed_data = await self.get_products_needing_confirmation(store_id)
        critical_count = len(unconfirmed_data["critical"])
        warn_count = len(unconfirmed_data["warning"])

        # Low stock
        low_stock = await self.db.execute(
            select(Product).where(
                and_(
                    Product.store_id == store_id,
                    Product.ativo == True,
                    Product.estoque <= Product.estoque_minimo,
                )
            )
        )
        low_stock_products = list(low_stock.scalars().all())

        # Format WhatsApp message
        now = datetime.utcnow()
        message_lines = [
            f"🌱 *{settings.STORE_NAME} — Resumo semanal*",
            f"📅 {now.strftime('%d/%m/%Y')}",
            "",
            f"📊 *Atendimentos:* {total_atendimentos}",
            f"👥 *Clientes novos:* {new_customers}",
            "",
        ]

        if top_products:
            message_lines.append("🔥 *Produtos mais consultados:*")
            for p in top_products[:5]:
                message_lines.append(
                    f"• {p.nome} — {p.consultas_semana} consultas"
                )
            message_lines.append("")

        if low_stock_products:
            message_lines.append("⚠️ *Estoque baixo:*")
            for p in low_stock_products[:3]:
                message_lines.append(f"• {p.nome} — {p.estoque} {p.unidade}")
            message_lines.append("")

        if critical_count > 0:
            message_lines.append(
                f"❗ *{critical_count} produto(s) sem confirmação há +30 dias*"
            )
            message_lines.append("")

        message_lines += [
            "Todos os produtos continuam disponíveis?",
            "",
            "Responda:",
            "1️⃣ *1* - Todos disponíveis",
            "2️⃣ *2* - Preciso atualizar estoque",
            "3️⃣ *3* - Ver detalhes completos",
        ]

        whatsapp_message = "\n".join(message_lines)

        # Structured data
        report_data = {
            "week_start": since.isoformat(),
            "week_end": now.isoformat(),
            "atendimentos": total_atendimentos,
            "clientes_novos": new_customers,
            "produtos_mais_consultados": [
                {"nome": p.nome, "consultas": p.consultas_semana}
                for p in top_products
            ],
            "estoque_baixo": [
                {"nome": p.nome, "estoque": p.estoque, "unidade": p.unidade}
                for p in low_stock_products
            ],
            "sem_confirmacao_critico": critical_count,
            "sem_confirmacao_alerta": warn_count,
        }

        # Save report
        report = WeeklyReport(
            store_id=store_id,
            week_start=since,
            week_end=now,
            data=report_data,
        )
        self.db.add(report)

        return {
            "data": report_data,
            "whatsapp_message": whatsapp_message,
        }

    async def interpret_admin_response(
        self,
        message: str,
        store_id: UUID,
        admin_phone: str,
    ) -> dict:
        """
        Interpret admin WhatsApp response for stock confirmation.
        Handles: SIM, TODOS DISPONÍVEIS, 1, ATUALIZAR, 2, 3, etc.
        Returns: { action, response_message, confirmed_count? }
        """
        text = message.strip().upper()

        # Positive confirmations
        positive = {
            "SIM", "1", "TODOS", "TODOS DISPONÍVEIS", "TODOS DISPONIVEIS",
            "OK", "CONFIRMADO", "CONFIRMADOS", "TUDO OK", "TUDO CERTO",
            "DISPONÍVEL", "DISPONIVEL", "TODOS OK",
        }

        # Request to update
        update_signals = {
            "2", "ATUALIZAR", "ATUALIZAÇÃO", "ATUALIZACAO",
            "ESTOQUE BAIXO", "BAIXO", "ATUALIZAR ESTOQUE",
            "PROBLEMA", "FALTA", "FALTANDO",
        }

        # Request for details
        detail_signals = {"3", "DETALHES", "VER DETALHES", "DETALHE"}

        if text in positive or any(text.startswith(p) for p in positive):
            count = await self.confirm_all_products(
                store_id=store_id,
                confirmed_by=f"admin_whatsapp:{admin_phone}",
                source="whatsapp_admin",
            )
            return {
                "action": "confirmed_all",
                "confirmed_count": count,
                "response_message": (
                    f"✅ Perfeito! Todos os {count} produtos foram confirmados. "
                    f"Próxima verificação em 7 dias. 🌱"
                ),
            }

        elif text in update_signals or any(text.startswith(s) for s in update_signals):
            return {
                "action": "request_update",
                "response_message": (
                    "📝 Entendido! Acesse o painel para atualizar:\n"
                    f"http://localhost:3000/admin/produtos\n\n"
                    "Ou me informe qual produto e o novo estoque:\n"
                    "_Ex: Golden Filhote 15kg — 8 unidades_"
                ),
            }

        elif text in detail_signals:
            groups = await self.get_products_needing_confirmation(store_id)
            critical = groups["critical"][:5]
            if critical:
                lines = ["📋 *Produtos sem confirmação (+30 dias):*", ""]
                for p in critical:
                    dias = (
                        (datetime.utcnow() - p.data_ultima_confirmacao).days
                        if p.data_ultima_confirmacao else 999
                    )
                    lines.append(f"• {p.nome} — {dias} dias sem confirmação")
                return {
                    "action": "details_sent",
                    "response_message": "\n".join(lines),
                }
            else:
                return {
                    "action": "details_sent",
                    "response_message": "✅ Nenhum produto crítico no momento!",
                }

        # Unrecognized — forward to AI for natural interpretation
        return {"action": "unknown", "response_message": None}

    # ─── Dashboard Stats ──────────────────────────────────────────────────────

    async def get_dashboard_stock_stats(self, store_id: UUID) -> dict:
        """Compact stats for the dashboard stock panel."""
        groups = await self.get_products_needing_confirmation(store_id)
        rankings = await self.get_product_rankings(store_id)

        # Last confirmation event
        result = await self.db.execute(
            select(Product)
            .where(
                and_(
                    Product.store_id == store_id,
                    Product.data_ultima_confirmacao != None,
                )
            )
            .order_by(Product.data_ultima_confirmacao.desc())
            .limit(1)
        )
        last_confirmed = result.scalar_one_or_none()

        # Last weekly report
        report_result = await self.db.execute(
            select(WeeklyReport)
            .where(WeeklyReport.store_id == store_id)
            .order_by(WeeklyReport.created_at.desc())
            .limit(1)
        )
        last_report = report_result.scalar_one_or_none()

        return {
            "ultima_atualizacao": (
                last_confirmed.data_ultima_confirmacao.isoformat()
                if last_confirmed and last_confirmed.data_ultima_confirmacao
                else None
            ),
            "ultima_confirmacao_por": (
                last_confirmed.confirmado_por if last_confirmed else None
            ),
            "pendentes_confirmacao": len(groups["critical"]) + len(groups["warning"]),
            "criticos": len(groups["critical"]),
            "alertas": len(groups["warning"]),
            "ok": len(groups["ok"]),
            "mais_consultados": rankings["mais_consultados_semana"][:5],
            "risco_ruptura": rankings["risco_ruptura"][:5],
            "ultimo_relatorio": (
                last_report.created_at.isoformat()
                if last_report else None
            ),
        }

    # ─── Stock Availability Check for AI ─────────────────────────────────────

    async def check_availability_confidence(
        self, product: Product
    ) -> dict:
        """
        Returns availability confidence info for AI context.
        If product >30 days unconfirmed, AI must use cautious language.
        """
        if product.data_ultima_confirmacao is None:
            dias = 999
        else:
            dias = (datetime.utcnow() - product.data_ultima_confirmacao).days

        confident = dias <= CONFIRMATION_CRITICAL_DAYS

        return {
            "nome": product.nome,
            "preco": product.preco,
            "preco_promo": product.preco_promocional,
            "estoque": product.estoque,
            "disponivel": product.estoque > 0,
            "confirmacao_dias": dias,
            "confirmado_recentemente": confident,
            # AI uses this flag to decide whether to affirm or hedge
            "resposta_cautelosa": not confident,
        }

    # ─── Audit helper ─────────────────────────────────────────────────────────

    async def _write_audit(
        self,
        store_id: UUID,
        action: str,
        entity_type: str,
        entity_id: str,
        entity_name: str,
        old_value,
        new_value,
        source: str,
        user_id: Optional[UUID] = None,
        user_name: Optional[str] = None,
        ip_address: Optional[str] = None,
    ) -> None:
        log = AuditLog(
            store_id=store_id,
            user_id=user_id,
            user_name=user_name,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            entity_name=entity_name,
            old_value=old_value,
            new_value=new_value,
            source=source,
            ip_address=ip_address,
        )
        self.db.add(log)
