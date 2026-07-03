"""
Tests for Admin AI intent parsing and preparer logic.
"""
from app.services.admin_ai.intent_parser import parse_intent_rule_based, _extract_quantity


def test_parse_reposicao():
    data = parse_intent_rule_based("Chegaram 20 sacos de Golden Adulto 15kg")
    assert data["intent"] == "reposicao"
    assert data.get("quantity") == 20


def test_parse_venda_balcao():
    data = parse_intent_rule_based("Venda no balcão: 2 unidades da ração X por 100 reais, pago no Pix")
    assert data["intent"] == "venda_balcao"
    assert data.get("quantity") == 2
    assert data.get("product_query") == "ração x"


def test_parse_venda_balcao_unidade_de():
    data = parse_intent_rule_based(
        "Venda no balcão: 1 unidade de Ração Golden Adulto 15kg por 139.90 reais, Pix"
    )
    assert data["intent"] == "venda_balcao"
    assert data.get("product_query") == "ração golden adulto 15kg"


def test_parse_venda_entrega():
    data = parse_intent_rule_based(
        "Vendi 2 sacos de Golden 15kg para João por 300 reais e precisa entregar na Rua das Flores"
    )
    assert data["intent"] == "venda_entrega"
    assert data.get("quantity") == 2
    assert data.get("product_query") == "golden 15kg"


def test_parse_venda_entrega_unidade_de():
    data = parse_intent_rule_based(
        "Vendi 1 unidade de Ração Golden Adulto 15kg para João por 140 reais e precisa entregar"
    )
    assert data["intent"] == "venda_entrega"
    assert data.get("product_query") == "ração golden adulto 15kg"


def test_parse_correcao():
    data = parse_intent_rule_based("O estoque real da ração Golden é 8")
    assert data["intent"] == "correcao_estoque"
    assert data.get("new_stock") == 8
    assert data.get("product_query") == "ração golden"


def test_parse_alteracao_preco():
    data = parse_intent_rule_based("Altere o preco de Golden Adulto para 199.90")
    assert data["intent"] == "alteracao_produto"
    assert data.get("changes", {}).get("preco") == 199.90


def test_parse_saida():
    data = parse_intent_rule_based("Retire 2 unidades da ração X por avaria")
    assert data["intent"] == "saida_estoque"
    assert data.get("quantity") == 2


def test_parse_low_stock_query():
    data = parse_intent_rule_based("Ver produtos com estoque baixo")
    assert data["intent"] == "listar_alertas_estoque"


def test_extract_quantity():
    assert _extract_quantity("chegaram 5 unidades") == 5
    assert _extract_quantity("vendi 2 sacos") == 2
