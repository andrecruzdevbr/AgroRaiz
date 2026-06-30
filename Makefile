.PHONY: help dev prod build down logs shell-backend shell-frontend migrate seed test lint clean

# ─── Help ─────────────────────────────────────────────────────────────────────
help:
	@echo ""
	@echo "  AgroRaiz Platform — Commands"
	@echo ""
	@echo "  DEVELOPMENT"
	@echo "  make dev          Start dev environment"
	@echo "  make down         Stop all services"
	@echo "  make logs         Follow all logs"
	@echo "  make logs-be      Follow backend logs"
	@echo ""
	@echo "  DATABASE"
	@echo "  make migrate      Run Alembic migrations"
	@echo "  make seed         Create default store + admin user"
	@echo "  make makemigration msg='...'  Generate new migration"
	@echo ""
	@echo "  PRODUCTION"
	@echo "  make prod         Start production stack"
	@echo "  make build        Build all images"
	@echo ""
	@echo "  UTILS"
	@echo "  make shell-be     Open backend shell"
	@echo "  make test         Run backend tests"
	@echo "  make lint         Run linters"
	@echo "  make clean        Remove volumes and images"
	@echo ""

# ─── Development ──────────────────────────────────────────────────────────────
dev:
	@cp -n .env.example .env 2>/dev/null || true
	docker compose up -d
	@echo ""
	@echo "  ✅ AgroRaiz running!"
	@echo "  Frontend : http://localhost:3000"
	@echo "  Backend  : http://localhost:8000"
	@echo "  API Docs : http://localhost:8000/api/docs"
	@echo ""

down:
	docker compose down

logs:
	docker compose logs -f

logs-be:
	docker compose logs -f backend worker

shell-be:
	docker compose exec backend bash

shell-fe:
	docker compose exec frontend sh

# ─── Database ─────────────────────────────────────────────────────────────────
migrate:
	docker compose exec backend alembic upgrade head

makemigration:
	docker compose exec backend alembic revision --autogenerate -m "$(msg)"

seed:
	docker compose exec backend python -m app.scripts.seed
	@echo ""
	@echo "  ✅ Seed complete!"
	@echo "  Login: admin@agroraiz.com.br"
	@echo "  Pass : AgroRaiz@2024"
	@echo "  ⚠️   Change password after first login!"
	@echo ""

# ─── Production ──────────────────────────────────────────────────────────────
prod:
	@if [ ! -f .env ]; then echo "❌ .env file required for production"; exit 1; fi
	docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
	@echo "✅ Production stack started"

build:
	docker compose build --no-cache

build-prod:
	docker compose -f docker-compose.yml -f docker-compose.prod.yml build --no-cache

# ─── Tests & Quality ─────────────────────────────────────────────────────────
test:
	docker compose exec backend pytest tests/ -v --tb=short

test-cov:
	docker compose exec backend pytest tests/ -v --cov=app --cov-report=term-missing

lint:
	docker compose exec backend ruff check app/
	docker compose exec frontend pnpm lint

format:
	docker compose exec backend ruff format app/

# ─── Clean ────────────────────────────────────────────────────────────────────
clean:
	docker compose down -v --rmi local
	@echo "✅ Volumes and images removed"

ps:
	docker compose ps

# ─── Local dev (sem Docker) ───────────────────────────────────────────────────
dev-local-be:
	@echo "Iniciando backend local..."
	@cd backend && uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

dev-local-fe:
	@echo "Iniciando frontend local..."
	@cd frontend && pnpm dev

migrate-local:
	@echo "Aplicando migrations (banco local)..."
	@cd backend && alembic upgrade head

seed-local:
	@echo "Populando banco local..."
	@cd backend && python3 -m app.scripts.seed
