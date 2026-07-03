"""
Prepare admin AI actions — build previews, handle ambiguity and required reasons.
"""
from __future__ import annotations

from typing import Any, Optional
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.product_repository import ProductRepository
from app.services.admin_ai.executor import REPOSICAO_MOTIVO
from app.services.admin_ai.product_resolver import resolve_products
from app.services.category_service import get_category_labels


def _preview_stock(product: dict, qty: int, op: str, new_stock: int) -> dict:
    return {
        "produto": product["nome"],
        "quantidade": qty,
        "operacao": op,
        "estoque_atual": product["estoque"],
        "estoque_final": new_stock,
        "unidade": product.get("unidade", "un"),
    }


async def prepare_from_intent(
    db: AsyncSession,
    store_id: UUID,
    intent_data: dict[str, Any],
    *,
    motivo: str | None = None,
    selected_product_id: str | None = None,
) -> dict[str, Any]:
    intent = intent_data.get("intent", "geral")

    if intent in ("consulta_estoque", "consulta_preco"):
        return await _prepare_query(db, store_id, intent_data, intent)

    if intent == "listar_alertas_estoque":
        return await _prepare_low_stock(db, store_id)

    product = None
    candidates: list[dict] = []

    if selected_product_id:
        from app.services.admin_ai.product_resolver import get_product_by_id, serialize_product_brief
        p = await get_product_by_id(db, store_id, UUID(selected_product_id))
        if p:
            product = serialize_product_brief(p)
    elif intent_data.get("product_query"):
        product, candidates, status = await resolve_products(
            db, store_id, intent_data["product_query"]
        )
        if status == "multiple":
            return {
                "response_type": "selection_required",
                "message": (
                    f"Encontrei {len(candidates)} produtos parecidos. "
                    "Informe o número da opção desejada:"
                ),
                "candidates": [
                    {**c, "index": i + 1} for i, c in enumerate(candidates[:6])
                ],
                "intent_data": intent_data,
            }
        if status == "none":
            return {
                "response_type": "message",
                "message": "Não encontrei esse produto no catálogo. Pode informar o nome completo?",
            }

    if intent == "reposicao":
        if not product:
            return {"response_type": "message", "message": "Qual produto chegou no estoque?"}
        qty = intent_data.get("quantity")
        if not qty:
            return {"response_type": "message", "message": f"Quantas unidades de {product['nome']} chegaram?"}
        new_stock = product["estoque"] + int(qty)
        action = {
            "action_type": "preparar_entrada_estoque",
            "product_id": product["id"],
            "quantity": int(qty),
            "motivo": REPOSICAO_MOTIVO,
            "supplier_note": intent_data.get("supplier_note"),
            "original_message": intent_data.get("raw_message", ""),
            "preview": _preview_stock(product, int(qty), "entrada", new_stock),
        }
        return _confirm_response(
            f"Confirma a entrada de {qty} {product.get('unidade', 'un')} de {product['nome']}? "
            f"Estoque: {product['estoque']} → {new_stock}.",
            action,
        )

    if intent == "venda_balcao":
        return await _prepare_sale(db, store_id, intent_data, product, "balcao", motivo)

    if intent == "venda_entrega":
        return await _prepare_sale(db, store_id, intent_data, product, "entrega", motivo)

    if intent == "correcao_estoque":
        if not product:
            return {"response_type": "message", "message": "Qual produto deseja corrigir?"}
        new_stock = intent_data.get("new_stock")
        if new_stock is None:
            return {"response_type": "message", "message": "Qual é o estoque real correto?"}
        if not motivo:
            return {
                "response_type": "reason_required",
                "message": "Qual o motivo desta alteração?",
                "intent_data": intent_data,
                "pending_reason_for": "correcao_estoque",
            }
        action = {
            "action_type": "preparar_correcao_estoque",
            "product_id": product["id"],
            "new_stock": int(new_stock),
            "motivo": motivo,
            "original_message": intent_data.get("raw_message", ""),
            "preview": {
                "produto": product["nome"],
                "estoque_atual": product["estoque"],
                "estoque_final": int(new_stock),
            },
        }
        return _confirm_response(
            f"Confirma correção de {product['nome']} para {new_stock} unidades?",
            action,
        )

    if intent == "saida_estoque":
        if not product:
            return {"response_type": "message", "message": "Qual produto terá saída de estoque?"}
        qty = intent_data.get("quantity")
        if not qty:
            return {"response_type": "message", "message": "Quantas unidades serão retiradas?"}
        if not motivo:
            return {
                "response_type": "reason_required",
                "message": "Qual o motivo desta alteração?",
                "intent_data": intent_data,
                "pending_reason_for": "saida_estoque",
            }
        new_stock = max(0, product["estoque"] - int(qty))
        action = {
            "action_type": "preparar_saida_estoque",
            "product_id": product["id"],
            "quantity": int(qty),
            "motivo": motivo,
            "adjustment_type": intent_data.get("adjustment_type", "retirada_manual"),
            "original_message": intent_data.get("raw_message", ""),
            "preview": _preview_stock(product, int(qty), "saída", new_stock),
        }
        return _confirm_response(
            f"Confirma saída de {qty} unidade(s) de {product['nome']}? "
            f"Estoque: {product['estoque']} → {new_stock}.",
            action,
        )

    if intent == "cadastro_produto":
        draft = intent_data.get("product_draft") or {}
        if not draft.get("nome") or not draft.get("preco"):
            return {
                "response_type": "message",
                "message": (
                    "Para cadastrar, informe: nome, categoria, preço, estoque e estoque mínimo. "
                    'Ex: "Cadastre ração X, categoria rações pet, preço 89,90, estoque 10, mínimo 3"'
                ),
            }
        labels = await get_category_labels(db, store_id)
        cat = (draft.get("categoria") or "").strip().lower()
        cat_match = None
        for slug, label in labels.items():
            if cat in slug.lower() or cat in label.lower():
                cat_match = slug
                break
        if cat and not cat_match:
            return {
                "response_type": "message",
                "message": f"Categoria '{cat}' não encontrada. Deseja criar uma nova categoria no painel antes?",
            }
        action = {
            "action_type": "preparar_criacao_produto",
            "product_draft": {**draft, "categoria": cat_match or cat},
            "original_message": intent_data.get("raw_message", ""),
            "preview": draft,
        }
        return _confirm_response(
            f"Confirma cadastro de '{draft.get('nome')}' por R$ {draft.get('preco')}?",
            action,
        )

    if intent == "alteracao_produto":
        if not product:
            return {"response_type": "message", "message": "Qual produto deseja alterar?"}
        changes = intent_data.get("changes") or {}
        if not changes:
            return {"response_type": "message", "message": "O que deseja alterar neste produto?"}
        if not motivo:
            return {
                "response_type": "reason_required",
                "message": "Qual o motivo desta alteração?",
                "intent_data": intent_data,
                "pending_reason_for": "alteracao_produto",
            }
        action = {
            "action_type": "preparar_alteracao_produto",
            "product_id": product["id"],
            "changes": changes,
            "motivo": motivo,
            "original_message": intent_data.get("raw_message", ""),
            "preview": {"produto": product["nome"], "alteracoes": changes},
        }
        return _confirm_response(
            f"Confirma alteração em {product['nome']}?",
            action,
        )

    return {
        "response_type": "message",
        "message": (
            "Posso ajudar com estoque, vendas, cadastro de produtos e alertas. "
            "Experimente: 'Quanto tem de Golden Adulto?' ou 'Chegaram 10 unidades de...'"
        ),
    }


async def _prepare_query(db, store_id, intent_data, intent) -> dict:
    product, candidates, status = await resolve_products(
        db, store_id, intent_data.get("product_query") or ""
    )
    if status == "none":
        return {"response_type": "message", "message": "Produto não encontrado."}
    if status == "multiple":
        return {
            "response_type": "selection_required",
            "message": "Qual destes produtos você quer consultar?",
            "candidates": [{**c, "index": i + 1} for i, c in enumerate(candidates[:6])],
            "intent_data": intent_data,
        }
    if intent == "consulta_preco":
        promo = product.get("preco_promocional")
        msg = f"{product['nome']}: R$ {product['preco']:.2f}"
        if promo:
            msg += f" (promoção: R$ {promo:.2f})"
        return {"response_type": "message", "message": msg}
    return {
        "response_type": "message",
        "message": (
            f"{product['nome']}: {product['estoque']} {product.get('unidade', 'un')} em estoque "
            f"(mínimo: {product.get('estoque_minimo', 0)})."
        ),
    }


async def _prepare_low_stock(db, store_id) -> dict:
    repo = ProductRepository(db)
    items = await repo.get_low_stock(store_id)
    if not items:
        return {"response_type": "message", "message": "Nenhum produto com estoque baixo ou zerado no momento."}
    lines = [f"• {p.nome}: {p.estoque} {p.unidade} (mín. {p.estoque_minimo})" for p in items[:15]]
    return {
        "response_type": "message",
        "message": f"Produtos com estoque baixo ({len(items)}):\n" + "\n".join(lines),
    }


async def _prepare_sale(db, store_id, intent_data, product, sale_type, motivo) -> dict:
    if not product:
        return {"response_type": "message", "message": "Qual produto foi vendido?"}
    qty = intent_data.get("quantity")
    if not qty:
        return {"response_type": "message", "message": "Quantas unidades foram vendidas?"}
    total = intent_data.get("total_price")
    if not total:
        total = product["preco"] * int(qty)
    new_stock = max(0, product["estoque"] - int(qty))
    if product["estoque"] < int(qty):
        return {
            "response_type": "message",
            "message": f"Estoque insuficiente: há apenas {product['estoque']} unidade(s) de {product['nome']}.",
        }

    preview = {
        "produto": product["nome"],
        "quantidade": int(qty),
        "valor_total": float(total),
        "estoque_atual": product["estoque"],
        "estoque_final": new_stock,
    }
    if sale_type == "balcao":
        preview["forma_pagamento"] = intent_data.get("payment_method") or "não informado"
        preview["retirada"] = "Na loja"
        preview["cliente"] = "Consumidor final"
        action_type = "preparar_venda_balcao"
        msg = (
            f"Confirma venda no balcão: {qty}x {product['nome']} por R$ {float(total):.2f}? "
            f"Estoque: {product['estoque']} → {new_stock}."
        )
    else:
        preview["cliente"] = intent_data.get("customer_name") or "Consumidor final"
        preview["endereco"] = intent_data.get("delivery_address") or "a confirmar"
        preview["entrega"] = "Pendente"
        action_type = "preparar_venda_entrega"
        if not intent_data.get("delivery_address"):
            return {
                "response_type": "message",
                "message": "Qual o endereço de entrega?",
                "intent_data": intent_data,
            }
        msg = (
            f"Confirma venda com entrega: {qty}x {product['nome']} por R$ {float(total):.2f} "
            f"para {preview['cliente']}? Estoque: {product['estoque']} → {new_stock}."
        )

    action = {
        "action_type": action_type,
        "product_id": product["id"],
        "quantity": int(qty),
        "total_price": float(total),
        "payment_method": intent_data.get("payment_method"),
        "customer_name": intent_data.get("customer_name"),
        "delivery_address": intent_data.get("delivery_address"),
        "original_message": intent_data.get("raw_message", ""),
        "preview": preview,
    }
    return _confirm_response(msg, action)


def _confirm_response(message: str, action: dict) -> dict:
    return {
        "response_type": "confirm_required",
        "message": message,
        "preview": action.get("preview"),
        "pending_action": action,
    }
