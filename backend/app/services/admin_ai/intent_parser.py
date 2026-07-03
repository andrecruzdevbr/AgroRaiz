"""
Parse admin natural-language messages into structured intents.
Hybrid: rule-based patterns + optional LLM enrichment.
"""
from __future__ import annotations

import json
import re
from typing import Any

from app.services.ai.providers.provider import get_ai_provider


def _parse_json_response(raw: str) -> dict[str, Any]:
    text = raw.strip()
    m = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if m:
        text = m.group(1).strip()
    return json.loads(text)


INTENTS = {
    "consulta_estoque",
    "listar_alertas_estoque",
    "consulta_preco",
    "reposicao",
    "venda_balcao",
    "venda_entrega",
    "correcao_estoque",
    "saida_estoque",
    "cadastro_produto",
    "alteracao_produto",
    "desfazer",
    "geral",
}


def _extract_quantity(text: str) -> int | None:
    m = re.search(r"(\d+)\s*(?:unidades?|sacos?|kg|litros?|caixas?|pacotes?|un\b)?", text, re.I)
    return int(m.group(1)) if m else None


def _extract_price(text: str) -> float | None:
    m = re.search(r"(?:por|a|de)\s*R?\$?\s*(\d+[.,]\d{2}|\d+)", text, re.I)
    if not m:
        m = re.search(r"(\d+[.,]\d{2})\s*reais", text, re.I)
    if m:
        return float(m.group(1).replace(",", "."))
    return None


def _extract_product_query(text: str) -> str | None:
    tl = text.lower()
    # Quantity + "de PRODUCT" (vendas e reposição) — evita capturar "de 1 unidade"
    qty_de = re.search(
        r"\d+\s*(?:unidades?|sacos?|kg|litros?|caixas?|pacotes?|un\b)\s+(?:do|da|de)\s+"
        r"(.+?)(?:\s+por\s+|\s+para\s+|\s+e\s+precisa|\s*$)",
        tl,
        re.I,
    )
    if qty_de:
        return qty_de.group(1).strip(" .,;")

    patterns = [
        r"(?:do|da|de)\s+(.+?)(?:\s+por\s+|\s+para\s+|\s+e\s+precisa|\s*$)",
        r"produto\s+(.+?)(?:\s+por\s+|\s*$)",
        r"estoque\s+(?:do|da|de)\s+(.+?)(?:\s+é|\s*$)",
        r"estoque real\s+(?:do|da|de)\s+(.+?)(?:\s+(?:é|e)\s+\d+|\s*$)",
        r"ração\s+(.+?)(?:\s+por\s+|\s*$)",
        r"golden\s+.+",
        r"premier\s+.+",
    ]
    for pat in patterns:
        m = re.search(pat, tl, re.I)
        if m:
            return m.group(1).strip(" .,;")
    # fallback: strip action words
    cleaned = re.sub(
        r"^(chegaram|vendi|venda no balcão|venda no balcao|cadastre|cadastrar|"
        r"o estoque real|retire|perdi|altere|mude|consulte|quanto tem)\s*",
        "",
        tl,
        flags=re.I,
    )
    cleaned = re.sub(r"\d+\s*(?:unidades?|sacos?).*", "", cleaned).strip()
    return cleaned if len(cleaned) > 3 else None


def parse_intent_rule_based(message: str) -> dict[str, Any]:
    text = message.strip()
    tl = text.lower()

    if re.search(r"\b(desfazer|desfaça|voltar última|undo)\b", tl):
        return {"intent": "desfazer", "raw_message": text}

    if re.search(r"\b(estoque baixo|zerados?|críticos?|alertas? de estoque)\b", tl):
        return {"intent": "listar_alertas_estoque", "raw_message": text}

    if re.search(r"\b(altere|mude|atualize)\b.*\b(preço|preco|promoção|promocao|categoria)\b", tl):
        return {
            "intent": "alteracao_produto",
            "product_query": _extract_product_query(text),
            "changes": _parse_product_changes(text),
            "raw_message": text,
        }

    if re.search(r"\b(preço|preco|quanto custa|valor)\b", tl) and not re.search(
        r"\bvendi\b|\b(altere|mude|atualize)\b", tl
    ):
        return {
            "intent": "consulta_preco",
            "product_query": _extract_product_query(text),
            "raw_message": text,
        }

    if re.search(r"\bestoque real\b|\bcorreção\b|\bcorrecao\b", tl):
        m = re.search(r"(?:é|e)\s*(\d+)", tl)
        m_prod = re.search(
            r"estoque real\s+(?:do|da|de)\s+(.+?)\s+(?:é|e)\s+\d+",
            tl,
            re.I,
        )
        return {
            "intent": "correcao_estoque",
            "product_query": (
                m_prod.group(1).strip(" .,;") if m_prod else _extract_product_query(text)
            ),
            "new_stock": int(m.group(1)) if m else None,
            "raw_message": text,
        }

    if re.search(r"\b(estoque|quantidade|quanto tem)\b", tl) and not re.search(
        r"\bvendi\b|\bchegaram\b", tl
    ):
        return {
            "intent": "consulta_estoque",
            "product_query": _extract_product_query(text),
            "raw_message": text,
        }

    if re.search(r"\bchegaram\b|\breposição\b|\breposicao\b|\bentrada\b", tl):
        return {
            "intent": "reposicao",
            "product_query": _extract_product_query(text),
            "quantity": _extract_quantity(text),
            "supplier_note": _extract_optional_note(text),
            "raw_message": text,
        }

    if re.search(r"\bvendi\b.*\b(entregar|entrega)\b", tl) or re.search(
        r"\bprecisa entregar\b", tl
    ):
        return {
            "intent": "venda_entrega",
            "product_query": _extract_product_query(text),
            "quantity": _extract_quantity(text),
            "total_price": _extract_price(text),
            "customer_name": _extract_customer_name(text),
            "delivery_address": _extract_address(text),
            "raw_message": text,
        }

    if re.search(r"\bvenda no balcão\b|\bvenda no balcao\b|\bbalcão\b|\bbalcao\b", tl):
        return {
            "intent": "venda_balcao",
            "product_query": _extract_product_query(text),
            "quantity": _extract_quantity(text),
            "total_price": _extract_price(text),
            "payment_method": _extract_payment(text),
            "raw_message": text,
        }

    if re.search(r"\bretire\b|\bperdi\b|\bavaria\b|\bvencimento\b|\bperda\b", tl):
        return {
            "intent": "saida_estoque",
            "product_query": _extract_product_query(text),
            "quantity": _extract_quantity(text),
            "adjustment_type": _detect_adjustment_type(tl),
            "raw_message": text,
        }

    if re.search(r"\bcadastre\b|\bcadastrar\b|\bnovo produto\b", tl, re.I):
        return {
            "intent": "cadastro_produto",
            "product_draft": _parse_product_draft(text),
            "raw_message": text,
        }

    return {"intent": "geral", "raw_message": text}


def _extract_optional_note(text: str) -> str | None:
    for pat in [r"nota\s+(\w+)", r"fornecedor\s+(.+?)(?:\.|$)", r"nf\s*(\d+)"]:
        m = re.search(pat, text, re.I)
        if m:
            return m.group(0)
    return None


def _extract_customer_name(text: str) -> str | None:
    m = re.search(r"para\s+([A-ZÁÉÍÓÚÂÊÔÃÕ][a-záéíóúâêôãõ]+(?:\s+[A-ZÁÉÍÓÚÂÊÔÃÕ][a-záéíóúâêôãõ]+)?)", text)
    return m.group(1) if m else None


def _extract_address(text: str) -> str | None:
    m = re.search(r"(?:entregar (?:na|em|no)\s+)(.+?)(?:\.|$)", text, re.I)
    if m:
        return m.group(1).strip()
    m = re.search(r"(rua\s+.+?)(?:\.|$)", text, re.I)
    return m.group(1).strip() if m else None


def _extract_payment(text: str) -> str | None:
    for kw in ["pix", "dinheiro", "cartão", "cartao", "débito", "debito", "crédito", "credito"]:
        if kw in text.lower():
            return kw
    return None


def _detect_adjustment_type(tl: str) -> str:
    for t, label in [
        ("avaria", "avaria"),
        ("vencimento", "vencimento"),
        ("perda", "perda"),
        ("uso interno", "uso_interno"),
    ]:
        if t in tl:
            return label
    return "retirada_manual"


def _parse_product_draft(text: str) -> dict[str, Any]:
    draft: dict[str, Any] = {}
    m = re.search(r"cadastre\s+(.+?)(?:,|\s+categoria)", text, re.I)
    if m:
        draft["nome"] = m.group(1).strip()
    m = re.search(r"categoria\s+([\w\s]+?)(?:,|\s+preço|\s+preco|$)", text, re.I)
    if m:
        draft["categoria"] = m.group(1).strip()
    m = re.search(r"preço\s+(\d+[.,]\d{2}|\d+)", text, re.I)
    if m:
        draft["preco"] = float(m.group(1).replace(",", "."))
    m = re.search(r"estoque\s+(\d+)", text, re.I)
    if m:
        draft["estoque"] = int(m.group(1))
    m = re.search(r"mínimo\s+(\d+)|minimo\s+(\d+)", text, re.I)
    if m:
        draft["estoque_minimo"] = int(m.group(1) or m.group(2))
    return draft


def _parse_product_changes(text: str) -> dict[str, Any]:
    changes: dict[str, Any] = {}
    m = re.search(
        r"(?:preço|preco)(?:\s+de\s+.+?)?\s+para\s+(\d+[.,]\d{2}|\d+)",
        text,
        re.I,
    )
    if m:
        changes["preco"] = float(m.group(1).replace(",", "."))
    m = re.search(r"promo(?:ção|cao)\s+(?:para\s+)?(\d+[.,]\d{2}|\d+)", text, re.I)
    if m:
        changes["preco_promocional"] = float(m.group(1).replace(",", "."))
    return changes


async def parse_intent(message: str) -> dict[str, Any]:
    """Rule-based first; enrich with LLM when available."""
    parsed = parse_intent_rule_based(message)
    if parsed["intent"] != "geral":
        return parsed

    try:
        provider = get_ai_provider()
        if not provider._key if hasattr(provider, "_key") else True:
            pass
        system = (
            "Você interpreta pedidos de gestão de loja agropecuária. "
            "Responda APENAS JSON válido com campos: intent, product_query, quantity, "
            "new_stock, total_price, customer_name, delivery_address, payment_method, "
            "product_draft, changes, reason. "
            f"intent deve ser um de: {', '.join(INTENTS)}."
        )
        raw = await provider.chat(
            system,
            [{"role": "user", "content": message}],
            max_tokens=512,
            temperature=0.2,
        )
        data = _parse_json_response(raw)
        if isinstance(data, dict) and data.get("intent"):
            data["raw_message"] = message
            return data
    except Exception:
        pass

    return parsed
