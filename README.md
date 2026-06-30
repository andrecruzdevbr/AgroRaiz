# 🌱 Agro Raiz Platform

Plataforma SaaS premium para gestão inteligente de lojas agro/pet, com IA humanizada no centro.

> **Stack:** Next.js 16 · FastAPI · PostgreSQL · Redis · Celery · WebSockets · Claude API · Evolution API

---

## 🚀 Início rápido

```bash
# 1. Clone e configure
git clone https://github.com/andrecruzdevbr/AgroRaiz.git
cd AgroRaiz
cp .env.example .env
# Edite .env com suas chaves (obrigatório: ANTHROPIC_API_KEY e EVOLUTION_API_KEY)

# 2. Suba tudo
make dev

# 3. Migrações + seed
make migrate
make seed
# → Login: admin@agroraiz.com.br / AgroRaiz@2024

# 4. Acesse
# Frontend : http://localhost:3000
# API Docs : http://localhost:8000/api/docs
```

---

## 📋 Comandos

```bash
make dev           # Inicia ambiente de desenvolvimento
make down          # Para todos os serviços
make logs          # Acompanha logs em tempo real
make migrate       # Executa migrações Alembic
make seed          # Cria loja padrão + admin
make test          # Roda testes do backend
make lint          # Linting (ruff + eslint)
make prod          # Sobe stack de produção
make clean         # Remove volumes e imagens
```

---

## 🏗️ Arquitetura

```
agroraiz/
├── backend/                    FastAPI · Python 3.12
│   ├── app/
│   │   ├── api/v1/endpoints/   auth · dashboard · customers · products
│   │   │                       conversations · whatsapp · instagram
│   │   │                       campaigns · ai_endpoints · realtime (WS)
│   │   ├── core/               config · database · redis · security · websocket · logging
│   │   ├── models/             Schema SQLAlchemy (multi-tenant)
│   │   ├── repositories/       base · customer · product · conversation · campaign
│   │   ├── services/           ai · whatsapp · instagram
│   │   ├── tasks/              Celery: WhatsApp · Instagram · campanhas · IA · cache
│   │   └── scripts/seed.py     Seed inicial
│   ├── tests/                  pytest
│   ├── alembic/                Migrações
│   └── Dockerfile
│
├── frontend/                   Next.js 16 · TypeScript · Tailwind · shadcn/ui
│   ├── app/
│   │   ├── page.tsx            Landing page
│   │   ├── login/              Autenticação JWT
│   │   └── admin/              dashboard · clientes · conversas · produtos
│   │                           ia · campanhas · analytics · instagram · configuracoes
│   ├── components/
│   │   ├── admin/              Todos os módulos do painel
│   │   ├── ui/                 shadcn/ui (preservado do v0)
│   │   └── error-boundary.tsx  Error handling
│   ├── lib/
│   │   ├── api.ts              Cliente HTTP tipado
│   │   ├── hooks.ts            React Query hooks (todos os endpoints)
│   │   ├── auth-store.ts       Zustand · JWT · refresh token
│   │   ├── store-extended.ts   Stores com API real
│   │   └── query-provider.tsx  ReactQueryProvider
│   ├── hooks/use-realtime.ts   WebSocket · auto-reconexão
│   ├── middleware.ts            Proteção de rotas Next.js
│   └── Dockerfile
│
├── nginx/nginx.conf             Reverse proxy · rate limiting · WS
├── docker-compose.yml           Desenvolvimento
├── docker-compose.prod.yml      Produção (replicas · healthchecks · limits)
├── Makefile                     Todos os comandos
└── .env.example                 Variáveis necessárias
```

---

## 🤖 IA Ana — Fluxo

```
Mensagem recebida (WhatsApp/Instagram)
         │
    [Sanitização anti-injection]
         │
    [Redis] Automação pausada? ──YES──► Skip
         │ NO
    [Detectar] Pedido de humano? ──YES──┐
         │ NO                           │
    [Detectar] Frustração (2×)? ──YES──┤ Human Takeover:
         │ NO                           │ · Mensagem de transição
    [Detectar] Pergunta repetida? ─YES──┤ · Pausa automação Redis
         │ NO                           │ · Fila human_takeover
    [DB] Contexto do cliente (CRM)      │ · Broadcast WS dashboard
         │                              │
    [DB] RAG: produtos relevantes  ◄────┘
         │
    [Claude API] Resposta humanizada
         │
    [Redis] Salva sessão 24h
         │
    [Evolution API] Envia c/ typing
         │
    [DB] Atualiza CRM + interação
         │
    [WebSocket] Broadcast dashboard
```

### Fallback humano
1. IA envia mensagem de transição ("Vou acionar um assistente...")
2. `human_takeover: true` gravado na sessão Redis
3. Push para fila `queue:human_takeover`
4. Notificação WebSocket no dashboard em tempo real
5. Atendente assume via Central de Conversas
6. Ao encerrar → clica **Reativar IA** → `POST /whatsapp/resume-automation`

---

## 📡 WebSocket Events

Conectar: `ws://localhost:8000/api/v1/ws/{store_id}?token={jwt}`

| Event | Payload | Trigger |
|-------|---------|---------|
| `new_message` | `{conversation_id, message}` | Mensagem recebida |
| `human_takeover` | `{phone, reason, priority}` | IA transferiu |
| `metrics_update` | KPIs | A cada 5 min |
| `stock_alert` | `{product_id, nome, estoque}` | Estoque abaixo mínimo |

---

## 🔐 Segurança

| Camada | Implementação |
|--------|--------------|
| Auth | JWT access (60min) + refresh (30 dias) |
| Autorização | RBAC: owner › admin › attendant › viewer |
| Anti-injection | Sanitiza prompts antes de enviar à IA |
| Rate limiting | Nginx: 100 req/min API · 300 req/min webhooks |
| Anti-spam WZ | Max 10 msgs/min por número |
| Anti-loop | Hash de mensagem previne duplicatas (30s) |
| Debounce | Agrupa mensagens rápidas (2s) |
| Multi-tenant | Toda query obrigatoriamente `store_id`-scoped |

---

## ⚙️ Configuração do WhatsApp

1. Instale a [Evolution API](https://doc.evolution-api.com/) (self-host ou cloud)
2. Configure `.env`:
   ```
   EVOLUTION_API_URL=https://sua-evolution-api.com
   EVOLUTION_API_KEY=sua-chave
   ```
3. Configure o webhook no painel da Evolution API:
   ```
   URL: https://seu-dominio.com/api/v1/whatsapp/webhook
   Eventos: messages.upsert, messages.update, connection.update, qrcode.updated
   ```
4. Escaneie o QR code em `/admin/configuracoes/whatsapp`

---

## 🏭 Deploy em produção

```bash
# Configure variáveis de produção no .env
# POSTGRES_PASSWORD, SECRET_KEY, JWT_SECRET_KEY obrigatórios
# DEBUG=false, LOG_FORMAT=json

make prod
make migrate
make seed
```

Stack de produção inclui: Nginx · 2 réplicas FastAPI · Worker Celery · Beat scheduler · PostgreSQL · Redis — com healthchecks, resource limits e restart automático.

---

## 📞 Agro Raiz
**Ouro Branco, MG** · WhatsApp: +55 31 99512-2303 · Instagram: [@_agroraiz_](https://instagram.com/_agroraiz_)
