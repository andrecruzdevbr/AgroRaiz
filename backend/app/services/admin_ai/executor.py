"""
Execute confirmed admin AI actions — validated mutations only.
"""
from __future__ import annotations

import json
from typing import Any
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import OrderStatus, Product
from app.repositories.customer_repository import CustomerRepository, SYSTEM_CUSTOMER_PHONE
from app.repositories.order_repository import OrderRepository
from app.repositories.product_repository import ProductRepository
from app.services.admin_ai.audit import write_admin_ai_audit
from app.services.admin_ai.product_resolver import get_product_by_id
from app.services.category_service import resolve_category_for_product

REPOSICAO_MOTIVO = "Reposição informada via Assistente de Gestão IA"
VENDA_BALCAO_MOTIVO = "Venda de balcão registrada via Assistente de Gestão IA"
VENDA_ENTREGA_MOTIVO = "Venda confirmada com solicitação de entrega via Assistente de Gestão IA"


async def _get_consumidor_final(db: AsyncSession, store_id: UUID):
    repo = CustomerRepository(db)
    customer = await repo.get_by_phone(SYSTEM_CUSTOMER_PHONE, store_id)
    if customer:
        return customer
    return await repo.create(
        store_id=store_id,
        phone=SYSTEM_CUSTOMER_PHONE,
        name="Consumidor final",
        observacoes="Cliente genérico para vendas de balcão via Assistente IA (não é lead CRM).",
    )


async def execute_action(
    db: AsyncSession,
    *,
    store_id: UUID,
    user_id: UUID,
    user_name: str,
    action: dict[str, Any],
) -> dict[str, Any]:
    action_type = action.get("action_type")
    handlers = {
        "preparar_entrada_estoque": _exec_stock_in,
        "preparar_saida_estoque": _exec_stock_out,
        "preparar_correcao_estoque": _exec_stock_correct,
        "preparar_venda_balcao": _exec_counter_sale,
        "preparar_venda_entrega": _exec_delivery_sale,
        "preparar_criacao_produto": _exec_create_product,
        "preparar_alteracao_produto": _exec_update_product,
        "cancelar_pedido": _exec_cancel_order,
        "concluir_entrega": _exec_complete_delivery,
    }
    handler = handlers.get(action_type)
    if not handler:
        raise HTTPException(400, f"Ação não suportada: {action_type}")
    return await handler(db, store_id=store_id, user_id=user_id, user_name=user_name, action=action)


async def undo_action(
    db: AsyncSession,
    *,
    store_id: UUID,
    user_id: UUID,
    user_name: str,
    undo_record: dict[str, Any],
) -> dict[str, Any]:
    undo_type = undo_record.get("undo_type")
    if undo_type == "stock":
        repo = ProductRepository(db)
        product = await repo.get(UUID(undo_record["product_id"]), store_id)
        if not product:
            raise HTTPException(404, "Produto não encontrado para desfazer")
        old = product.estoque
        await repo.adjust_stock(product.id, undo_record["restore_stock"], "corrigir")
        await write_admin_ai_audit(
            db,
            store_id=store_id,
            user_id=user_id,
            user_name=user_name,
            action="admin_ai_undo_stock",
            entity_type="product",
            entity_id=str(product.id),
            entity_name=product.nome,
            old_value={"estoque": old},
            new_value={"estoque": undo_record["restore_stock"]},
            motivo="Desfazer ação do Assistente de Gestão IA",
        )
        return {"message": f"Estoque de {product.nome} restaurado para {undo_record['restore_stock']}."}

    if undo_type == "order_cancel":
        return await _exec_cancel_order(
            db,
            store_id=store_id,
            user_id=user_id,
            user_name=user_name,
            action={"order_id": undo_record["order_id"], "motivo": "Desfazer venda via Assistente IA"},
        )

    raise HTTPException(400, "Não é possível desfazer esta ação")


async def _exec_stock_in(db, *, store_id, user_id, user_name, action) -> dict:
    repo = ProductRepository(db)
    pid = UUID(action["product_id"])
    product = await repo.get(pid, store_id)
    if not product:
        raise HTTPException(404, "Produto não encontrado")
    qty = int(action["quantity"])
    old = product.estoque
    new_stock = await repo.adjust_stock(pid, qty, "adicionar")
    motivo = action.get("motivo") or REPOSICAO_MOTIVO
    await write_admin_ai_audit(
        db, store_id=store_id, user_id=user_id, user_name=user_name,
        action="admin_ai_stock_in", entity_type="product", entity_id=str(pid),
        entity_name=product.nome, old_value={"estoque": old},
        new_value={"estoque": new_stock, "operation": "adicionar", "quantity": qty},
        original_message=action.get("original_message", ""), motivo=motivo,
    )
    return {
        "message": f"Entrada registrada: +{qty} {product.unidade}. Estoque agora: {new_stock}.",
        "undo": {"undo_type": "stock", "product_id": str(pid), "restore_stock": old},
    }


async def _exec_stock_out(db, *, store_id, user_id, user_name, action) -> dict:
    repo = ProductRepository(db)
    pid = UUID(action["product_id"])
    product = await repo.get(pid, store_id)
    if not product:
        raise HTTPException(404, "Produto não encontrado")
    qty = int(action["quantity"])
    if product.estoque < qty:
        raise HTTPException(400, f"Estoque insuficiente ({product.estoque} disponível)")
    old = product.estoque
    new_stock = await repo.adjust_stock(pid, qty, "remover")
    await write_admin_ai_audit(
        db, store_id=store_id, user_id=user_id, user_name=user_name,
        action="admin_ai_stock_out", entity_type="product", entity_id=str(pid),
        entity_name=product.nome, old_value={"estoque": old},
        new_value={"estoque": new_stock, "operation": "remover", "quantity": qty},
        original_message=action.get("original_message", ""), motivo=action.get("motivo", ""),
    )
    return {
        "message": f"Saída registrada: -{qty} {product.unidade}. Estoque agora: {new_stock}.",
        "undo": {"undo_type": "stock", "product_id": str(pid), "restore_stock": old},
    }


async def _exec_stock_correct(db, *, store_id, user_id, user_name, action) -> dict:
    repo = ProductRepository(db)
    pid = UUID(action["product_id"])
    product = await repo.get(pid, store_id)
    if not product:
        raise HTTPException(404, "Produto não encontrado")
    new_stock = int(action["new_stock"])
    old = product.estoque
    await repo.adjust_stock(pid, new_stock, "corrigir")
    await write_admin_ai_audit(
        db, store_id=store_id, user_id=user_id, user_name=user_name,
        action="admin_ai_stock_correct", entity_type="product", entity_id=str(pid),
        entity_name=product.nome, old_value={"estoque": old},
        new_value={"estoque": new_stock, "operation": "corrigir"},
        original_message=action.get("original_message", ""), motivo=action.get("motivo", ""),
    )
    return {
        "message": f"Estoque corrigido para {new_stock} {product.unidade}.",
        "undo": {"undo_type": "stock", "product_id": str(pid), "restore_stock": old},
    }


async def _exec_counter_sale(db, *, store_id, user_id, user_name, action) -> dict:
    return await _exec_sale(
        db, store_id=store_id, user_id=user_id, user_name=user_name, action=action,
        canal="balcao_admin_ai", status=OrderStatus.ENTREGUE,
        delivery_meta={"tipo": "balcao", "status_entrega": "retirada_loja"},
        audit_action="admin_ai_sale_counter", default_motivo=VENDA_BALCAO_MOTIVO,
    )


async def _exec_delivery_sale(db, *, store_id, user_id, user_name, action) -> dict:
    return await _exec_sale(
        db, store_id=store_id, user_id=user_id, user_name=user_name, action=action,
        canal="admin_ai", status=OrderStatus.CONFIRMADA,
        delivery_meta={
            "tipo": "entrega",
            "status_entrega": "pendente",
            "endereco": action.get("delivery_address"),
            "cliente_display": action.get("customer_name") or "Consumidor final",
        },
        audit_action="admin_ai_sale_delivery", default_motivo=VENDA_ENTREGA_MOTIVO,
    )


async def _exec_sale(db, *, store_id, user_id, user_name, action, canal, status, delivery_meta, audit_action, default_motivo) -> dict:
    repo = ProductRepository(db)
    order_repo = OrderRepository(db)
    pid = UUID(action["product_id"])
    product = await repo.get(pid, store_id)
    if not product:
        raise HTTPException(404, "Produto não encontrado")
    qty = int(action["quantity"])
    if product.estoque < qty:
        raise HTTPException(400, f"Estoque insuficiente ({product.estoque} disponível)")
    total = float(action.get("total_price") or (product.preco * qty))
    unit = round(total / qty, 2)

    customer = await _get_consumidor_final(db, store_id)
    meta = {
        **delivery_meta,
        "admin_ai": True,
        "mensagem_original": action.get("original_message", ""),
        "forma_pagamento": action.get("payment_method"),
    }
    order = await order_repo.create_sale(
        store_id=store_id,
        customer_id=customer.id,
        items=[{
            "product_id": product.id,
            "nome_produto": product.nome,
            "quantidade": qty,
            "preco_unitario": unit,
            "subtotal": total,
        }],
        total=total,
        canal_origem=canal,
        forma_pagamento=action.get("payment_method"),
        status=status,
        observacoes=json.dumps(meta, ensure_ascii=False),
    )

    old_stock = product.estoque
    new_stock = await repo.adjust_stock(product.id, qty, "remover")

    await write_admin_ai_audit(
        db, store_id=store_id, user_id=user_id, user_name=user_name,
        action=audit_action, entity_type="order", entity_id=str(order.id),
        entity_name=product.nome,
        old_value={"estoque": old_stock, "order_status": None},
        new_value={
            "estoque": new_stock, "order_id": str(order.id),
            "quantidade": qty, "total": total, **delivery_meta,
        },
        original_message=action.get("original_message", ""), motivo=default_motivo,
    )

    return {
        "message": (
            f"Venda registrada: {qty}x {product.nome} por R$ {total:.2f}. "
            f"Estoque: {old_stock} → {new_stock}."
        ),
        "order_id": str(order.id),
        "undo": {
            "undo_type": "order_cancel",
            "order_id": str(order.id),
            "product_id": str(product.id),
            "quantity": qty,
            "restore_stock": old_stock,
        },
    }


async def _exec_create_product(db, *, store_id, user_id, user_name, action) -> dict:
    repo = ProductRepository(db)
    draft = action.get("product_draft", {})
    nome = draft.get("nome")
    preco = draft.get("preco")
    if not nome or not preco:
        raise HTTPException(400, "Nome e preço são obrigatórios")
    cat_slug, cat_id = None, None
    if draft.get("categoria"):
        cat_slug, cat_id = await resolve_category_for_product(db, store_id, draft["categoria"])
    product = await repo.create(
        store_id=store_id,
        nome=nome,
        categoria=cat_slug,
        category_id=cat_id,
        preco=float(preco),
        estoque=int(draft.get("estoque", 0)),
        estoque_minimo=int(draft.get("estoque_minimo", 5)),
        ativo=True,
    )
    await write_admin_ai_audit(
        db, store_id=store_id, user_id=user_id, user_name=user_name,
        action="admin_ai_product_create", entity_type="product", entity_id=str(product.id),
        entity_name=product.nome, old_value=None,
        new_value={"nome": product.nome, "preco": product.preco, "estoque": product.estoque},
        original_message=action.get("original_message", ""),
        motivo="Cadastro via Assistente de Gestão IA",
    )
    return {"message": f"Produto '{product.nome}' cadastrado com sucesso."}


async def _exec_update_product(db, *, store_id, user_id, user_name, action) -> dict:
    repo = ProductRepository(db)
    pid = UUID(action["product_id"])
    product = await repo.get(pid, store_id)
    if not product:
        raise HTTPException(404, "Produto não encontrado")
    changes = action.get("changes", {})
    old = {k: getattr(product, k) for k in changes if hasattr(product, k)}
    await repo.update(product, **changes)
    await write_admin_ai_audit(
        db, store_id=store_id, user_id=user_id, user_name=user_name,
        action="admin_ai_product_update", entity_type="product", entity_id=str(pid),
        entity_name=product.nome, old_value=old, new_value=changes,
        original_message=action.get("original_message", ""),
        motivo=action.get("motivo", ""),
    )
    return {"message": f"Produto '{product.nome}' atualizado."}


async def _exec_cancel_order(db, *, store_id, user_id, user_name, action) -> dict:
    order_repo = OrderRepository(db)
    prod_repo = ProductRepository(db)
    oid = UUID(action["order_id"])
    order = await order_repo.get_with_items(oid, store_id)
    if not order:
        raise HTTPException(404, "Pedido não encontrado")
    if order.status == OrderStatus.CANCELADA:
        raise HTTPException(400, "Pedido já está cancelado")

    meta = {}
    try:
        meta = json.loads(order.observacoes or "{}")
    except json.JSONDecodeError:
        pass
    if meta.get("estoque_devolvido"):
        raise HTTPException(400, "Estoque já foi devolvido para este pedido")

    restored = []
    for item in order.items:
        if item.product_id and item.quantidade:
            product = await prod_repo.get(item.product_id, store_id)
            if product:
                old = product.estoque
                new_stock = await prod_repo.adjust_stock(product.id, item.quantidade, "adicionar")
                restored.append({"product": product.nome, "qty": item.quantidade, "estoque": new_stock})
                await write_admin_ai_audit(
                    db, store_id=store_id, user_id=user_id, user_name=user_name,
                    action="admin_ai_order_cancel_restore",
                    entity_type="product", entity_id=str(product.id), entity_name=product.nome,
                    old_value={"estoque": old}, new_value={"estoque": new_stock, "order_id": str(oid)},
                    motivo=action.get("motivo", "Cancelamento de pedido via Assistente IA"),
                )

    order.status = OrderStatus.CANCELADA
    meta["estoque_devolvido"] = True
    meta["cancelado_em"] = "admin_ai"
    order.observacoes = json.dumps(meta, ensure_ascii=False)
    await db.flush()

    return {
        "message": f"Pedido cancelado. Estoque devolvido para {len(restored)} item(ns).",
        "restored": restored,
    }


async def _exec_complete_delivery(db, *, store_id, user_id, user_name, action) -> dict:
    order_repo = OrderRepository(db)
    oid = UUID(action["order_id"])
    order = await order_repo.get_with_items(oid, store_id)
    if not order:
        raise HTTPException(404, "Pedido não encontrado")
    meta = {}
    try:
        meta = json.loads(order.observacoes or "{}")
    except json.JSONDecodeError:
        pass
    if meta.get("status_entrega") == "entregue":
        return {"message": "Entrega já estava marcada como concluída. Estoque não foi alterado."}

    meta["status_entrega"] = "entregue"
    order.status = OrderStatus.ENTREGUE
    order.observacoes = json.dumps(meta, ensure_ascii=False)
    await db.flush()

    await write_admin_ai_audit(
        db, store_id=store_id, user_id=user_id, user_name=user_name,
        action="admin_ai_delivery_complete", entity_type="order", entity_id=str(oid),
        entity_name=f"Pedido {str(oid)[:8]}",
        old_value={"status_entrega": "pendente"},
        new_value={"status_entrega": "entregue"},
        motivo="Entrega concluída via Assistente IA",
    )
    return {"message": "Entrega marcada como concluída. O estoque não foi alterado novamente."}
