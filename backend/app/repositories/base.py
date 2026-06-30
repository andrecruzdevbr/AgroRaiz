"""
AgroRaiz - Base Repository
Generic async CRUD operations. All domain repos extend this.
"""
from typing import Generic, TypeVar, Type, Optional, List, Any
from uuid import UUID

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import Base

ModelType = TypeVar("ModelType", bound=Base)


class BaseRepository(Generic[ModelType]):
    """
    Generic repository providing type-safe async CRUD.
    All queries are store-scoped for multi-tenant safety.
    """

    def __init__(self, model: Type[ModelType], db: AsyncSession):
        self.model = model
        self.db = db

    async def get(self, id: UUID, store_id: UUID) -> Optional[ModelType]:
        result = await self.db.execute(
            select(self.model).where(
                self.model.id == id,
                self.model.store_id == store_id,
            )
        )
        return result.scalar_one_or_none()

    async def get_by_id(self, id: UUID) -> Optional[ModelType]:
        return await self.db.get(self.model, id)

    async def list(
        self,
        store_id: UUID,
        offset: int = 0,
        limit: int = 50,
        **filters,
    ) -> tuple[List[ModelType], int]:
        query = select(self.model).where(self.model.store_id == store_id)
        count_query = select(func.count()).select_from(self.model).where(
            self.model.store_id == store_id
        )

        for key, value in filters.items():
            if value is not None and hasattr(self.model, key):
                query = query.where(getattr(self.model, key) == value)
                count_query = count_query.where(getattr(self.model, key) == value)

        total = await self.db.scalar(count_query)
        result = await self.db.execute(query.offset(offset).limit(limit))
        return result.scalars().all(), total or 0

    async def create(self, **kwargs) -> ModelType:
        obj = self.model(**kwargs)
        self.db.add(obj)
        await self.db.flush()
        await self.db.refresh(obj)
        return obj

    async def update(self, obj: ModelType, **kwargs) -> ModelType:
        for key, value in kwargs.items():
            if hasattr(obj, key):
                setattr(obj, key, value)
        await self.db.flush()
        await self.db.refresh(obj)
        return obj

    async def delete(self, obj: ModelType) -> None:
        await self.db.delete(obj)
        await self.db.flush()

    async def count(self, store_id: UUID, **filters) -> int:
        query = select(func.count()).select_from(self.model).where(
            self.model.store_id == store_id
        )
        for key, value in filters.items():
            if value is not None and hasattr(self.model, key):
                query = query.where(getattr(self.model, key) == value)
        return await self.db.scalar(query) or 0
