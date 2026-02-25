# Services & Integrations Health Dashboard

**Date:** 2026-02-25
**Status:** Approved

## Problem

External services used by PACO agents (Anthropic, OpenAI Whisper, Google Gemini, Google Maps, Chatwoot, CEA API, Langfuse) have no visibility in the UI. MCP tools get a dedicated health dashboard; external API integrations have none. When a service goes down, there's no way to know until an agent fails.

## Approach

Full DB model (like MCP Servers) with auto-seeding from configured API keys on startup. Each service is a first-class entity with CRUD, provider-aware health checks, and a dedicated UI page.

## Data Model

```sql
CREATE TABLE external_services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR NOT NULL UNIQUE,
    service_type VARCHAR NOT NULL DEFAULT 'custom',
    provider VARCHAR NOT NULL DEFAULT 'custom',
    base_url VARCHAR,
    api_key_env_var VARCHAR,
    auth_config JSONB NOT NULL DEFAULT '{}',
    health_check_endpoint VARCHAR,
    health_check_method VARCHAR NOT NULL DEFAULT 'GET',
    status VARCHAR NOT NULL DEFAULT 'unknown',
    last_health_check TIMESTAMP WITH TIME ZONE,
    response_time_ms INTEGER,
    last_error TEXT,
    is_auto_seeded BOOLEAN NOT NULL DEFAULT FALSE,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
```

### Fields

- `service_type`: `llm_provider` | `media_processor` | `observability` | `integration` | `database` | `custom`
- `provider`: drives built-in health check logic — `anthropic` | `openai` | `gemini` | `google_maps` | `chatwoot` | `cea_api` | `langfuse` | `postgres_ext` | `custom`
- `api_key_env_var`: references a key name (not the secret) — resolved from `GlobalSetting` or env at health-check time
- `is_auto_seeded`: distinguishes system-created vs user-created to prevent duplication on restart
- `status`: `online` | `offline` | `error` | `unknown` | `unconfigured`

## Auto-Seed on Startup

Runs after `_ensure_default_admin` in lifespan. Upserts on `(provider, is_auto_seeded=True)` — idempotent, never overwrites user edits.

Only seeds if the corresponding API key is configured (in GlobalSetting or env var).

| Provider | Default Name | Type | Base URL | Env Var |
|----------|-------------|------|----------|---------|
| anthropic | Anthropic Claude API | llm_provider | https://api.anthropic.com | ANTHROPIC_API_KEY |
| openai | OpenAI Whisper | media_processor | https://api.openai.com | OPENAI_API_KEY |
| gemini | Google Gemini | media_processor | https://generativelanguage.googleapis.com | GEMINI_API_KEY |
| google_maps | Google Maps | integration | https://maps.googleapis.com | GOOGLE_MAPS_API_KEY |
| chatwoot | Chatwoot | integration | (from CHATWOOT_BASE_URL) | CHATWOOT_API_TOKEN |
| cea_api | CEA API | integration | https://aquacis-cf.ceaqueretaro.gob.mx | N/A (proxy) |
| langfuse | Langfuse | observability | (from langfuse_host config) | LANGFUSE_PUBLIC_KEY |
| postgres_ext | Agora Database | database | (from PGHOST:PGPORT) | PGPASSWORD |

## Backend API

Router: `backend/app/api/services.py`, prefix `/api/services`

```
GET    /api/services                    → List all services
POST   /api/services                    → Create a service
GET    /api/services/{id}               → Get single service
PUT    /api/services/{id}               → Update a service
DELETE /api/services/{id}               → Delete a service (AdminUser)
POST   /api/services/{id}/health        → Trigger health check
POST   /api/services/health/all         → Check all services
```

Auth: OperatorUser for all. AdminUser for delete.

### Provider-Aware Health Checks

Implemented in `backend/app/services/external_service_health.py`:

| Provider | Method | Validation |
|----------|--------|-----------|
| anthropic | POST `/v1/messages` | 1-token request, check 200 or 401 |
| openai | GET `/v1/models` | List models, confirms key validity |
| gemini | `generateContent` via SDK | Tiny text-only request |
| google_maps | GET geocode with known coords | Confirms key + quota |
| chatwoot | GET `/api/v1/profile` | Confirms token validity |
| cea_api | GET through proxy | Confirms proxy + endpoint reachability |
| langfuse | GET `/api/public/health` | Basic auth with pub/secret key |
| postgres_ext | `SELECT 1` | Confirms connectivity |
| custom | GET/POST to `health_check_endpoint` | Generic HTTP 2xx check |

## Frontend

### New Page: `/services`

Sidebar entry between "Tools" and "Skills".

Two-column layout (like Tools page):
- **Left column**: service list with status dots, grouped by service_type
- **Right column**: detail panel for selected service

### Service Groups

```
LLM Providers
  ● Anthropic Claude API

Media Processors
  ● OpenAI Whisper
  ● Google Gemini

Integrations
  ● Google Maps
  ● Chatwoot
  ● CEA API

Observability
  ● Langfuse

Databases
  ● Agora Database
```

### UI Elements

- Status dots: green (online), red (offline/error), gray (unknown), yellow (unconfigured)
- Summary strip: `● 6 Online  ● 1 Error  ● 1 Unconfigured`
- Per-service refresh button with spinner (same pattern as MCP servers)
- "Check All" button for bulk health check
- "Add Service" modal: name, service_type, provider, base_url, api_key_env_var, health_check_endpoint
- React Query: `useQuery(["services"])` with 30s refetch, `useMutation` for health checks

## Files

### New
| File | Purpose |
|------|---------|
| `backend/app/api/services.py` | Router — CRUD + health check endpoints |
| `backend/app/services/external_service_health.py` | Provider-aware health check logic |
| `backend/alembic/versions/xxxx_add_external_services.py` | Migration |
| `frontend/app/services/layout.tsx` | Auth guard layout |
| `frontend/app/services/page.tsx` | Services & Integrations page |

### Modified
| File | Change |
|------|--------|
| `backend/app/db/models.py` | Add ExternalService model |
| `backend/app/main.py` | Register router + seed function in lifespan |
| `frontend/components/ui/Sidebar.tsx` | Add "Services" nav entry |
| `frontend/lib/api.ts` | Add ExternalService interface + API methods |
