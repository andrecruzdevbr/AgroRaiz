"""AgroRaiz - API v1 Router"""
from fastapi import APIRouter

from app.api.v1.endpoints import (
    auth, dashboard, customers, products,
    conversations, whatsapp, instagram,
    campaigns, ai_endpoints, realtime, stock_monitoring, store,
)

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["Auth"])
api_router.include_router(dashboard.router, prefix="/dashboard", tags=["Dashboard"])
api_router.include_router(customers.router, prefix="/customers", tags=["CRM"])
api_router.include_router(products.router, prefix="/products", tags=["Estoque"])
api_router.include_router(conversations.router, prefix="/conversations", tags=["Conversas"])
api_router.include_router(whatsapp.router, prefix="/whatsapp", tags=["WhatsApp"])
api_router.include_router(instagram.router, prefix="/instagram", tags=["Instagram"])
api_router.include_router(campaigns.router, prefix="/campaigns", tags=["Campanhas"])
api_router.include_router(ai_endpoints.router, prefix="/ai", tags=["IA"])
api_router.include_router(stock_monitoring.router, prefix="/stock-monitoring", tags=["Estoque Inteligente"])
api_router.include_router(store.router, prefix="/store", tags=["Loja"])
api_router.include_router(realtime.router, tags=["Realtime"])
