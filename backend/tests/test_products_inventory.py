"""
Tests for products, categories and inventory helpers.
"""
import pytest

from app.repositories.category_repository import slugify
from app.repositories.product_repository import ProductRepository
from app.api.v1.endpoints.products import _stock_status


def test_slugify_basic():
    assert slugify("Rações Pet") == "racoes_pet"
    assert slugify("  Ferramentas  ") == "ferramentas"


def test_stock_status_values():
    class P:
        estoque = 0
        estoque_minimo = 5

    p = P()
    assert _stock_status(p) == "sem_estoque"
    p.estoque = 3
    assert _stock_status(p) == "critico"
    p.estoque = 8
    assert _stock_status(p) == "baixo"
    p.estoque = 50
    assert _stock_status(p) == "normal"


def test_estoque_status_filter_sem_estoque():
    f = ProductRepository._estoque_status_filter("sem_estoque")
    assert f is not None


def test_estoque_status_filter_unknown():
    assert ProductRepository._estoque_status_filter("invalid") is None
