# Webhook Production Readiness - Design & Task List

**Date**: 2026-02-22
**Status**: Pending approval
**Context**: Full review by 4 agents identified 21 issues across backend security, frontend, and test coverage.

---

## Scope

Fix all blocking and high-severity issues found in the webhook feature (inbound + outbound) before production deployment. The feature is architecturally complete (models, schemas, migrations, UI components all exist) but has security gaps, a missing API client layer, and zero test coverage.

## Task Breakdown

### Phase 1: Critical Blockers (must fix, nothing works without these)

#### Task 1.1: Add webhook API methods + types to `frontend/lib/api.ts`
- **Severity**: CRITICAL (entire UI non-functional)
- **What**: The 9 frontend components import 14 API methods and 9 TypeScript types that don't exist in the API client
- **Methods to add**: `getAgentInboundWebhooks`, `createInboundWebhook`, `updateInboundWebhook`, `deleteInboundWebhook`, `regenerateWebhookToken`, `getWebhookEvents`, `getOutboundWebhooks`, `createOutboundWebhook`, `updateOutboundWebhook`, `deleteOutboundWebhook`, `testOutboundWebhook`, `getWebhookDeliveries`, `retryWebhookDelivery`, `getWebhookEventTypes`
- **Types to add**: `InboundWebhook`, `InboundWebhookCreated`, `InboundWebhookEvent`, `CreateInboundWebhookRequest`, `OutboundWebhook`, `OutboundWebhookCreated`, `CreateOutboundWebhookRequest`, `WebhookDeliveryItem`, `WebhookEventTypeInfo`
- **Backend routes**: Inbound CRUD at `/api/agents/{agent_id}/webhooks/inbound`, Outbound CRUD at `/api/webhooks`, Event types at `/api/webhooks/events`
- **File**: `frontend/lib/api.ts`

#### Task 1.2: Encrypt inbound webhook secrets (parity with outbound)
- **Severity**: CRITICAL (plaintext secrets in DB)
- **What**: Inbound webhook `secret` field is stored as plain `String(255)`. Outbound uses Fernet encryption via `encrypt_webhook_secret()`/`decrypt_webhook_secret()`. Bring inbound to parity.
- **Files**: `backend/app/api/inbound_webhooks.py` (lines 108, 313-317), `backend/app/db/models.py` (line 1380)
- **Approach**: Encrypt on write with `encrypt_webhook_secret()`, decrypt on read for HMAC verification with `decrypt_webhook_secret()`

### Phase 2: High Severity (security & safety)

#### Task 2.1: Add payload size limit to public receiver
- **Severity**: HIGH (DoS risk)
- **What**: `/api/webhooks/in/{token}` reads full `request.body()` with no size limit. Attacker can POST multi-GB payloads.
- **File**: `backend/app/api/inbound_webhooks.py` (line 348)
- **Approach**: Check `Content-Length` header, reject >1MB with 413

#### Task 2.2: Add delete confirmation dialogs
- **Severity**: HIGH (data loss risk)
- **What**: Both InboundWebhookList and OutboundWebhookList delete on single click with no confirmation. Also, regenerate-token fires immediately.
- **Files**: `frontend/components/webhooks/InboundWebhookList.tsx` (lines 223, 231), `frontend/components/webhooks/OutboundWebhookList.tsx` (line 193)
- **Approach**: Add `confirm()` dialog or inline confirmation state before destructive mutations

#### Task 2.3: Display regenerated token to user
- **Severity**: HIGH (usability)
- **What**: `regenerateMutation.onSuccess` discards the response containing the new token/URL. User can't see the new webhook URL.
- **File**: `frontend/components/webhooks/InboundWebhookList.tsx` (lines 63-69)
- **Approach**: Capture response in state and display via `SecretDisplay` component (same pattern as creation)

#### Task 2.4: Mask token in API list/get responses
- **Severity**: HIGH (token exposure)
- **What**: `InboundWebhookResponse` includes full `token` field in every list/get call. Token is the sole auth credential for the public receiver.
- **Files**: `backend/app/api/inbound_webhooks.py` (line 51), `backend/app/schemas/inbound_webhooks.py`
- **Approach**: Remove `token` from standard response. Only return on creation and regeneration. Add masked `token_hint` field showing last 8 chars.

#### Task 2.5: Add SSRF protection for outbound webhook URLs
- **Severity**: HIGH (SSRF risk)
- **What**: Outbound webhook test/delivery makes HTTP requests to user-controlled URLs with no validation against internal IPs.
- **Files**: `backend/app/api/webhooks.py` (line 247), `backend/app/schemas/webhooks.py` (line 49)
- **Approach**: Validate URL scheme (https required in production, http allowed in dev). Block private/reserved IP ranges (RFC 1918, link-local, loopback). Use Pydantic `HttpUrl` validator.

#### Task 2.6: Sanitize error responses
- **Severity**: HIGH (info leak)
- **What**: Global error handler returns `str(exc)` and `type(exc).__name__`. Agent errors and queue errors also leaked to external callers.
- **Files**: `backend/app/main.py` (lines 392-401), `backend/app/api/inbound_webhooks.py` (line 440), `backend/app/api/webhooks.py` (line 363)
- **Approach**: Return generic error messages in production. Log details server-side only.

### Phase 3: Medium Severity (correctness & UX)

#### Task 3.1: Fix race condition on event counter
- **What**: `total_events` incremented with Python `(wh.total_events or 0) + 1` instead of atomic SQL increment.
- **File**: `backend/app/api/inbound_webhooks.py` (lines 449-450)
- **Fix**: Use `InboundWebhook.total_events + 1` for atomic SQL UPDATE

#### Task 3.2: Validate outbound event types against enum
- **What**: `events` field is `List[str]` with no validation against `WebhookEventType`. Typos silently never trigger.
- **File**: `backend/app/schemas/webhooks.py` (line 50)
- **Fix**: Add Pydantic validator checking each event string against defined types

#### Task 3.3: Add `onError` to toggle and retry mutations
- **What**: Toggle (active/inactive) and retry mutations silently swallow errors.
- **Files**: `InboundWebhookList.tsx` (lines 55-61), `OutboundWebhookList.tsx` (lines 45-51), `OutboundDeliveryLog.tsx` (lines 31-36)
- **Fix**: Add `onError: (err: ApiError) => setError(err.detail)` consistent with other mutations

#### Task 3.4: Fix webhook URL copy to use API base URL
- **What**: Uses `window.location.origin` instead of the configured API URL.
- **File**: `InboundWebhookList.tsx` (lines 72-73)
- **Fix**: Import and use `API_URL` or `NEXT_PUBLIC_API_URL`

#### Task 3.5: Add escape-key and backdrop-click close to outbound form modal
- **File**: `OutboundWebhookForm.tsx` (line 53)
- **Fix**: Add `onKeyDown` handler for Escape and `onClick` on backdrop div

### Phase 4: Low Severity (polish)

#### Task 4.1: Filter sensitive headers before storage
- **What**: All request headers (including `Authorization`, cookies) stored in `inbound_webhook_events.headers`.
- **File**: `backend/app/api/inbound_webhooks.py` (line 355)
- **Fix**: Strip `authorization`, `cookie`, `x-api-key` headers before saving

#### Task 4.2: Log warning on silent signing failure
- **What**: `decrypt_webhook_secret` failure caught with bare `pass` in test delivery.
- **File**: `backend/app/api/webhooks.py` (lines 230-231)
- **Fix**: Add `logger.warning()` call

#### Task 4.3: Add accessibility attributes to custom toggles
- **Files**: `InboundWebhookList.tsx` (lines 206-218), `OutboundWebhookList.tsx` (lines 167-180), `EventTypeSelector.tsx` (lines 66-84)
- **Fix**: Add `role="switch"`, `aria-checked`, `aria-label`

#### Task 4.4: Remove unused import
- **File**: `InboundWebhookList.tsx` (line 10)
- **Fix**: Remove `ExternalLink` from lucide-react import

#### Task 4.5: Default SecretDisplay to hidden
- **File**: `SecretDisplay.tsx` (line 12)
- **Fix**: Change `useState(true)` to `useState(false)`

### Phase 5: Test Coverage (separate PR recommended)

#### Task 5.1: Write inbound webhook public receiver tests (~14 tests)
- Highest risk area: unauthenticated, internet-facing
- Token auth (valid/invalid/missing), HMAC verification, payload handling, sync/async modes, inactive webhooks, missing agents

#### Task 5.2: Write CRUD auth boundary tests (~10 tests)
- Admin vs operator permissions on each endpoint
- 403 rejection for unauthorized roles

#### Task 5.3: Write outbound delivery tests (~8 tests)
- HMAC signing correctness, delivery tracking, retry logic, test ping

#### Task 5.4: Write utility unit tests (~5 tests)
- `_verify_signature()`, `_extract_prompt()`, `encrypt_webhook_secret`/`decrypt_webhook_secret` roundtrip

#### Task 5.5: Add conftest helpers
- `create_test_webhook()`, `create_test_inbound_webhook()` factory functions
- Import webhook models into conftest

---

## Execution Strategy

- **Phases 1-4**: Fix in a single branch, one commit per phase
- **Phase 5**: Separate PR for tests (can be parallel work)
- **Estimated tasks**: 20 implementation tasks across 5 phases
- **Approach**: Use parallel agents for independent tasks within each phase
