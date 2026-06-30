"""
AgroRaiz - Pytest shared fixtures
Garante que os testes rodem com segredos de webhook configurados,
para que os testes de "chave errada" continuem testando isso (e não
o caminho de "webhook não configurado", que é coberto separadamente).
"""
import pytest


@pytest.fixture(autouse=True)
def _configure_webhook_secrets(monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "EVOLUTION_API_KEY", "test-evolution-key-12345")
    monkeypatch.setattr(settings, "INSTAGRAM_APP_SECRET", "test-instagram-app-secret")
    yield
