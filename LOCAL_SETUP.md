# AgroRaiz — Local Setup Guide

Plataforma SaaS de atendimento para Agro Raiz (Ouro Branco - MG).  
Stack: **Next.js 16 + FastAPI + PostgreSQL + Redis + Celery + OpenRouter AI**

---

## Requisitos

| Ferramenta | Versão mínima | Verificar |
|---|---|---|
| Node.js | 20.x LTS | `node --version` |
| pnpm | 9+ | `pnpm --version` |
| Python | 3.11+ | `python3 --version` |
| PostgreSQL | 14+ | `psql --version` |
| Redis | 6+ | `redis-server --version` |
| Docker + Compose | 24+ / v2 | `docker compose version` |

> **Windows:** use WSL2 (Ubuntu 22.04+) para rodar o backend. O frontend funciona nativo.

---

## 1. Clonar / Extrair o projeto

```bash
# Extrair o ZIP:
unzip agroraiz-final.zip
cd agroraiz-full
```

---

## 2. Configurar o .env

```bash
# Copiar o template
cp .env.example .env
```

Edite `.env` e preencha **obrigatoriamente**:

```dotenv
# Gerar com: python3 -c "import secrets; print(secrets.token_hex(32))"
SECRET_KEY=<gere-aqui>
JWT_SECRET_KEY=<gere-aqui>
POSTGRES_PASSWORD=<senha-forte>

# OpenRouter — https://openrouter.ai/keys
OPENROUTER_API_KEY=sk-or-v1-...

# WhatsApp (Evolution API) — configurar após subir a infra
EVOLUTION_API_URL=http://localhost:8080
EVOLUTION_API_KEY=<chave-da-sua-instancia>
EVOLUTION_INSTANCE_NAME=agroraiz

# Instagram (Meta Graph API) — opcional para dev local
INSTAGRAM_ACCESS_TOKEN=
INSTAGRAM_BUSINESS_ID=
INSTAGRAM_WEBHOOK_TOKEN=<token-aleatorio>
INSTAGRAM_APP_SECRET=<app-secret-meta>
```

> **Nunca** commitar o `.env` — ele já está no `.gitignore`.

---

## 3. Backend

### 3a. Criar ambiente virtual e instalar dependências

```bash
cd backend

# Linux / Mac / WSL2
python3 -m venv .venv
source .venv/bin/activate

# Windows (PowerShell)
python -m venv .venv
.venv\Scripts\Activate.ps1

pip install -r requirements.txt
```

### 3b. Banco de dados

```bash
# Criar banco (substitua a senha pelo valor de POSTGRES_PASSWORD)
psql -U postgres -c "CREATE USER agroraiz WITH PASSWORD 'agroraiz_dev';"
psql -U postgres -c "CREATE DATABASE agroraiz OWNER agroraiz;"
psql -U postgres -c "GRANT ALL ON DATABASE agroraiz TO agroraiz;"
```

### 3c. Migrations (Alembic)

```bash
# Exportar variáveis ou usar .env via python-dotenv
export DATABASE_URL=postgresql+asyncpg://agroraiz:agroraiz_dev@localhost:5432/agroraiz

# Aplicar todas as migrations (cria as 15 tabelas)
alembic upgrade head

# Verificar estado
alembic current
# Deve exibir: 001_initial_schema (head)
```

### 3d. Popular o banco (seed)

```bash
# Cria: 1 loja, 1 admin e 51 produtos reais
python3 -m app.scripts.seed
```

**Credenciais criadas:**
- Email: `admin@agroraiz.com.br`
- Senha: `AgroRaiz@2024`

> ⚠️ Troque a senha no primeiro login.

### 3e. Executar backend em modo desenvolvimento

```bash
# Configurar variáveis (ou manter no .env e usar dotenv)
export DATABASE_URL=postgresql+asyncpg://agroraiz:agroraiz_dev@localhost:5432/agroraiz
export REDIS_URL=redis://localhost:6379/0
export SECRET_KEY=<sua-chave>
export JWT_SECRET_KEY=<sua-chave>
export OPENROUTER_API_KEY=<sua-chave>
export DEBUG=true

uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Acesse: http://localhost:8000/api/docs

### 3f. Executar workers Celery (opcional para dev)

```bash
# Worker (processa tarefas)
celery -A app.tasks.celery_app worker --loglevel=info

# Beat (agendador de tarefas recorrentes)
celery -A app.tasks.celery_app beat --loglevel=info
```

---

## 4. Frontend

```bash
cd frontend

# Instalar dependências
pnpm install --ignore-scripts

# Verificar tipagem
npx tsc --noEmit

# Verificar lint
pnpm lint
```

### 4a. Variável de ambiente do frontend

Crie `frontend/.env.local`:

```dotenv
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### 4b. Executar em modo desenvolvimento

```bash
pnpm dev
```

Acesse: http://localhost:3000

### 4c. Build de produção

```bash
pnpm build
pnpm start
```

---

## 5. Subir tudo com Docker (recomendado)

```bash
# Na raiz do projeto
docker compose up -d

# Aguardar serviços ficarem healthy (30–60s)
docker compose ps

# Aplicar migrations
docker compose exec backend alembic upgrade head

# Popular banco
docker compose exec backend python3 -m app.scripts.seed

# Ver logs em tempo real
docker compose logs -f backend frontend
```

### Serviços e portas

| Serviço | Porta | URL |
|---|---|---|
| Frontend (Next.js) | 3000 | http://localhost:3000 |
| Backend (FastAPI) | 8000 | http://localhost:8000 |
| API Docs (Swagger) | 8000 | http://localhost:8000/api/docs |
| PostgreSQL | 5432 | — |
| Redis | 6379 | — |

---

## 6. Criar usuário administrador manualmente

Se precisar recriar o admin sem rodar o seed completo:

```bash
# No shell do backend (ou docker exec)
python3 -c "
import asyncio
from app.core.database import AsyncSessionLocal, init_db
from app.models.models import Store, User, UserRole
from app.core.security import hash_password

async def create_admin():
    await init_db()
    async with AsyncSessionLocal() as db:
        from sqlalchemy import select
        store = (await db.execute(select(Store).limit(1))).scalar_one_or_none()
        if not store:
            print('ERROR: Nenhuma loja encontrada. Execute o seed primeiro.')
            return
        user = User(
            store_id=store.id,
            name='Admin',
            email='admin@agroraiz.com.br',
            hashed_password=hash_password('SuaSenhaForte@2024'),
            role=UserRole.OWNER,
            active=True,
        )
        db.add(user)
        await db.commit()
        print('Admin criado: admin@agroraiz.com.br')

asyncio.run(create_admin())
"
```

---

## 7. Testes

```bash
# Backend
cd backend
pytest tests/ -v

# Frontend (type-check)
cd frontend
npx tsc --noEmit
pnpm lint
```

---

## 8. Estrutura do projeto

```
agroraiz-full/
├── .env.example          # Template de variáveis de ambiente
├── .gitignore            # Exclui .env, node_modules, __pycache__, etc.
├── docker-compose.yml    # Dev: postgres, redis, backend, worker, beat, frontend
├── docker-compose.prod.yml  # Produção: adiciona nginx
├── Makefile              # Atalhos: make dev, make migrate, make seed, etc.
├── setup.sh              # Script de setup Linux/Mac
├── setup.bat             # Script de setup Windows
├── LOCAL_SETUP.md        # Este arquivo
│
├── backend/
│   ├── app/
│   │   ├── api/v1/endpoints/   # auth, dashboard, customers, products,
│   │   │                        # conversations, whatsapp, instagram,
│   │   │                        # campaigns, ai_endpoints, stock_monitoring, realtime
│   │   ├── core/               # config, database, redis_client, security, websocket
│   │   ├── models/models.py    # 15 tabelas SQLAlchemy
│   │   ├── repositories/       # Padrão repository (base, customer, product, campaign)
│   │   ├── services/           # ai/, whatsapp/, instagram/, stock_monitoring_service
│   │   ├── tasks/celery_app.py # 12 tarefas Celery + Beat schedule
│   │   └── scripts/seed.py     # Seed: 1 loja + 1 admin + 51 produtos
│   ├── alembic/
│   │   ├── versions/001_initial_schema.py  # Migração real (15 tabelas)
│   │   ├── env.py
│   │   └── script.py.mako
│   ├── tests/
│   │   ├── conftest.py
│   │   └── test_core.py   # 29 testes
│   ├── requirements.txt
│   ├── alembic.ini
│   └── Dockerfile
│
├── frontend/
│   ├── app/               # Next.js App Router (14 rotas)
│   │   ├── page.tsx              # Landing page
│   │   ├── login/page.tsx        # Login
│   │   └── admin/
│   │       ├── page.tsx          # Dashboard
│   │       ├── clientes/         # CRM
│   │       ├── produtos/         # Catálogo
│   │       ├── conversas/        # Atendimento
│   │       ├── ia/               # Configuração IA Ana
│   │       ├── campanhas/        # WhatsApp campaigns
│   │       ├── analytics/        # Relatórios
│   │       ├── instagram/        # Social
│   │       ├── configuracoes/    # Settings
│   │       └── estoque-inteligente/  # AI stock monitoring
│   ├── components/
│   │   ├── admin/         # 11 content components (dashboard, clientes, etc.)
│   │   ├── landing/       # Landing sections
│   │   ├── ui/            # 57 shadcn/ui components
│   │   └── theme-provider.tsx
│   ├── lib/
│   │   ├── api.ts         # Typed HTTP client (matches backend exactly)
│   │   ├── auth-store.ts  # Zustand auth state (JWT)
│   │   ├── hooks.ts       # React Query hooks
│   │   ├── query-provider.tsx
│   │   ├── types.ts       # TypeScript interfaces (match backend schema)
│   │   └── utils.ts
│   ├── hooks/
│   │   ├── use-realtime.ts    # WebSocket hook
│   │   └── use-toast.ts
│   ├── public/            # favicon.ico, assets
│   ├── styles/globals.css
│   ├── middleware.ts      # Auth guard (JWT cookie)
│   ├── next.config.mjs
│   ├── tsconfig.json      # @/* alias → ./
│   ├── package.json
│   ├── pnpm-lock.yaml
│   └── eslint.config.mjs
│
└── nginx/
    └── nginx.conf         # Produção: reverse proxy + SSL
```

---

## 9. Funcionalidades implementadas

| Módulo | Status |
|---|---|
| Landing page (site vitrine Agro Raiz) | ✅ |
| Autenticação JWT (login + refresh) | ✅ |
| Dashboard com métricas em tempo real | ✅ |
| CRM — Clientes (CRUD completo) | ✅ |
| Catálogo — Produtos (CRUD + ajuste de estoque) | ✅ |
| Estoque Inteligente (confirmação IA, auditoria, relatório semanal) | ✅ |
| Central de Conversas (WhatsApp + WebSocket) | ✅ |
| IA Ana (OpenRouter / Gemini 2.5 Flash) | ✅ |
| Campanhas WhatsApp (CRUD completo, incluindo DELETE) | ✅ |
| Analytics e relatórios | ✅ |
| Instagram (integração Meta Graph API) | ✅ |
| Configurações da loja, WhatsApp e notificações | ✅ |
| Tarefas agendadas (Celery Beat): relatórios, confirmação de estoque | ✅ |
| Validação HMAC nos webhooks (WhatsApp e Instagram) | ✅ |
| Rate limiting (slowapi) | ✅ |

## 10. Pendências para produção

| Item | Como resolver |
|---|---|
| WhatsApp ao vivo | Contratar/instalar Evolution API, configurar `EVOLUTION_API_KEY` |
| Instagram ao vivo | Obter token Meta Business via app aprovado |
| SSL/TLS | Configurar Certbot no nginx (`docker-compose.prod.yml`) |
| Domínio real | Atualizar `CORS_ORIGINS` e `ALLOWED_HOSTS` no `.env` de produção |
| Backup do banco | Configurar `pg_dump` agendado ou serviço gerenciado |
