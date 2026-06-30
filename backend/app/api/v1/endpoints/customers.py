"""
AgroRaiz - Customers (CRM) Endpoints
Gestão completa de clientes, histórico, tags e analytics.
"""
from uuid import UUID
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, EmailStr
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user, require_admin, require_attendant
from app.repositories.customer_repository import CustomerRepository

router = APIRouter()


class CustomerCreate(BaseModel):
    phone: str
    name: Optional[str] = None
    email: Optional[str] = None
    cpf: Optional[str] = None
    tipo: str = "pessoa_fisica"
    tags: List[str] = []
    observacoes: Optional[str] = None
    endereco: dict = {}
    preferencias: dict = {}


class CustomerUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    status: Optional[str] = None
    tags: Optional[List[str]] = None
    observacoes: Optional[str] = None
    preferencias: Optional[dict] = None
    endereco: Optional[dict] = None


@router.get("")
async def list_customers(
    busca: str = Query(""),
    status: str = Query(None),
    frequencia: str = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    repo = CustomerRepository(db)
    offset = (page - 1) * page_size
    customers, total = await repo.search(
        store_id=current_user.store_id,
        busca=busca,
        status=status,
        frequencia=frequencia,
        offset=offset,
        limit=page_size,
    )
    return {
        "customers": [_serialize(c) for c in customers],
        "total": total,
        "page": page,
        "total_pages": (total + page_size - 1) // page_size,
    }


@router.get("/analytics")
async def get_analytics(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    repo = CustomerRepository(db)
    return await repo.get_analytics(current_user.store_id)


@router.get("/inactive")
async def get_inactive(
    days: int = Query(60, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    repo = CustomerRepository(db)
    customers = await repo.get_inactive(current_user.store_id, days_threshold=days)
    return {
        "customers": [_serialize(c) for c in customers],
        "total": len(customers),
    }


@router.get("/{customer_id}")
async def get_customer(
    customer_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    repo = CustomerRepository(db)
    customer = await repo.get(customer_id, current_user.store_id)
    if not customer:
        raise HTTPException(404, "Cliente não encontrado")
    return _serialize(customer)


@router.get("/{customer_id}/interactions")
async def get_interactions(
    customer_id: UUID,
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    from sqlalchemy import select
    from app.models.models import CustomerInteraction

    customer = await db.get(__import__("app.models.models", fromlist=["Customer"]).Customer, customer_id)
    if not customer or customer.store_id != current_user.store_id:
        raise HTTPException(404, "Cliente não encontrado")

    result = await db.execute(
        select(CustomerInteraction)
        .where(CustomerInteraction.customer_id == customer_id)
        .order_by(CustomerInteraction.created_at.desc())
        .limit(limit)
    )
    interactions = result.scalars().all()
    return {
        "interactions": [
            {
                "id": str(i.id),
                "tipo": i.tipo,
                "resumo": i.resumo,
                "sentimento": i.sentimento.value if i.sentimento else None,
                "atendido_por": i.atendido_por,
                "created_at": i.created_at.isoformat() if i.created_at else None,
            }
            for i in interactions
        ]
    }


@router.post("", status_code=201)
async def create_customer(
    body: CustomerCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_attendant),
):
    repo = CustomerRepository(db)
    existing = await repo.get_by_phone(body.phone, current_user.store_id)
    if existing:
        raise HTTPException(409, "Já existe um cliente com este telefone")

    customer = await repo.create(
        store_id=current_user.store_id,
        **body.model_dump(),
    )
    return _serialize(customer)


@router.patch("/{customer_id}")
async def update_customer(
    customer_id: UUID,
    body: CustomerUpdate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_attendant),
):
    repo = CustomerRepository(db)
    customer = await repo.get(customer_id, current_user.store_id)
    if not customer:
        raise HTTPException(404, "Cliente não encontrado")

    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    customer = await repo.update(customer, **updates)
    return _serialize(customer)


@router.delete("/{customer_id}", status_code=204)
async def delete_customer(
    customer_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_admin),
):
    repo = CustomerRepository(db)
    customer = await repo.get(customer_id, current_user.store_id)
    if not customer:
        raise HTTPException(404, "Cliente não encontrado")
    # Soft delete
    from app.models.models import CustomerStatus
    await repo.update(customer, status=CustomerStatus.INATIVO)


def _serialize(c) -> dict:
    return {
        "id": str(c.id),
        "phone": c.phone,
        "name": c.name,
        "email": c.email,
        "cpf": c.cpf,
        "tipo": c.tipo,
        "status": c.status.value if c.status else "ativo",
        "frequencia": c.frequencia.value if c.frequencia else "novo",
        "tags": c.tags or [],
        "observacoes": c.observacoes,
        "total_compras": c.total_compras,
        "valor_total_gasto": round(c.valor_total_gasto or 0, 2),
        "endereco": c.endereco or {},
        "preferencias": c.preferencias or {},
        "ultima_compra": c.ultima_compra.isoformat() if c.ultima_compra else None,
        "ultimo_contato": c.ultimo_contato.isoformat() if c.ultimo_contato else None,
        "created_at": c.created_at.isoformat() if c.created_at else None,
    }
