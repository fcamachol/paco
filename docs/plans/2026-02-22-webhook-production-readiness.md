# Webhook Production Readiness Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all critical, high, and medium severity issues found in the webhook feature so it's production-ready.

**Architecture:** The webhook feature has a complete backend (FastAPI routers, SQLAlchemy models, Pydantic schemas, Alembic migration) and frontend (9 React components). The fixes are surgical: add missing API client layer, harden security, improve UX safety, and add polish.

**Tech Stack:** Python/FastAPI backend, Next.js/React/TypeScript frontend, SQLAlchemy ORM, Pydantic schemas, TanStack Query.

---

## Task 1: Add Webhook TypeScript Types to `frontend/lib/api.ts`

**Files:**
- Modify: `frontend/lib/api.ts` (after line 1731, before `export const api`)

**Step 1: Add all webhook TypeScript interfaces**

Add these interfaces before `export const api = new ApiClient(API_URL);` (line 1734):

```typescript
// ==========================================================================
// Webhook types
// ==========================================================================

export interface InboundWebhook {
  id: string;
  agent_id: string;
  name: string;
  description: string | null;
  token: string;
  url: string;
  source: string | null;
  is_active: boolean;
  processing_mode: string;
  has_secret: boolean;
  signature_header: string | null;
  prompt_template: string | null;
  total_events: number;
  last_event_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface InboundWebhookCreated extends InboundWebhook {
  secret: string | null;
}

export interface CreateInboundWebhookRequest {
  name: string;
  description?: string;
  source?: string;
  processing_mode?: "async" | "sync";
  secret?: string;
  signature_header?: string;
  prompt_template?: string;
}

export interface InboundWebhookEvent {
  id: string;
  webhook_id: string;
  source_ip: string | null;
  headers: Record<string, any>;
  payload: Record<string, any>;
  prompt_sent: string | null;
  status: string;
  agent_response: Record<string, any> | null;
  error_message: string | null;
  processing_ms: number | null;
  signature_valid: boolean | null;
  received_at: string;
  completed_at: string | null;
}

export interface InboundWebhookEventList {
  events: InboundWebhookEvent[];
  total: number;
  page: number;
  per_page: number;
}

export interface OutboundWebhook {
  id: string;
  user_id: string;
  name: string;
  url: string;
  events: string[];
  agent_id: string | null;
  is_active: boolean;
  description: string | null;
  has_secret: boolean;
  created_at: string;
  updated_at: string;
}

export interface OutboundWebhookCreated extends OutboundWebhook {
  secret: string;
}

export interface CreateOutboundWebhookRequest {
  name: string;
  url: string;
  events: string[];
  agent_id?: string;
  description?: string;
}

export interface UpdateOutboundWebhookRequest {
  name?: string;
  url?: string;
  events?: string[];
  agent_id?: string | null;
  is_active?: boolean;
  description?: string;
  rotate_secret?: boolean;
}

export interface WebhookTestResponse {
  success: boolean;
  delivery_id: string;
  status_code: number | null;
  error: string | null;
}

export interface WebhookDeliveryItem {
  id: string;
  webhook_id: string;
  event_type: string;
  payload: Record<string, any>;
  status: string;
  response_status_code: number | null;
  response_body: string | null;
  attempts: number;
  max_attempts: number;
  next_retry_at: string | null;
  error_message: string | null;
  created_at: string;
  delivered_at: string | null;
}

export interface WebhookDeliveryListResponse {
  deliveries: WebhookDeliveryItem[];
  total: number;
  page: number;
  per_page: number;
}

export interface WebhookEventTypeInfo {
  event_type: string;
  description: string;
  category: string;
}
```

**Step 2: Verify no TypeScript errors**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -20`
Expected: Types compile (may show errors from missing methods, that's Task 2)

**Step 3: Commit**

```bash
git add frontend/lib/api.ts
git commit -m "feat: add webhook TypeScript interfaces to API client"
```

---

## Task 2: Add Webhook API Methods to `frontend/lib/api.ts`

**Files:**
- Modify: `frontend/lib/api.ts` (inside `ApiClient` class, before the closing `}`)

**Step 1: Add all 14 webhook API methods**

Add these methods inside the `ApiClient` class, before the final closing brace (before line 1239):

```typescript
  // ==========================================================================
  // Webhook endpoints
  // ==========================================================================

  // --- Inbound Webhooks ---

  async getAgentInboundWebhooks(agentId: string) {
    return this.request<InboundWebhook[]>(
      `/api/agents/${agentId}/webhooks/inbound`
    );
  }

  async createInboundWebhook(agentId: string, data: CreateInboundWebhookRequest) {
    return this.request<InboundWebhookCreated>(
      `/api/agents/${agentId}/webhooks/inbound`,
      { method: "POST", body: JSON.stringify(data) }
    );
  }

  async updateInboundWebhook(
    agentId: string,
    webhookId: string,
    data: Record<string, any>
  ) {
    return this.request<InboundWebhook>(
      `/api/agents/${agentId}/webhooks/inbound/${webhookId}`,
      { method: "PUT", body: JSON.stringify(data) }
    );
  }

  async deleteInboundWebhook(agentId: string, webhookId: string) {
    return this.request<void>(
      `/api/agents/${agentId}/webhooks/inbound/${webhookId}`,
      { method: "DELETE" }
    );
  }

  async regenerateWebhookToken(agentId: string, webhookId: string) {
    return this.request<InboundWebhook>(
      `/api/agents/${agentId}/webhooks/inbound/${webhookId}/regenerate-token`,
      { method: "POST" }
    );
  }

  async getWebhookEvents(
    agentId: string,
    webhookId: string,
    page: number = 1,
    perPage: number = 50
  ) {
    return this.request<InboundWebhookEventList>(
      `/api/agents/${agentId}/webhooks/inbound/${webhookId}/events?page=${page}&per_page=${perPage}`
    );
  }

  // --- Outbound Webhooks ---

  async getOutboundWebhooks(agentId?: string) {
    const params = agentId ? `?agent_id=${agentId}` : "";
    return this.request<OutboundWebhook[]>(`/api/webhooks${params}`);
  }

  async createOutboundWebhook(data: CreateOutboundWebhookRequest) {
    return this.request<OutboundWebhookCreated>("/api/webhooks", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateOutboundWebhook(id: string, data: Record<string, any>) {
    return this.request<OutboundWebhook>(`/api/webhooks/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async deleteOutboundWebhook(id: string) {
    return this.request<void>(`/api/webhooks/${id}`, { method: "DELETE" });
  }

  async testOutboundWebhook(id: string) {
    return this.request<WebhookTestResponse>(`/api/webhooks/${id}/test`, {
      method: "POST",
    });
  }

  async getWebhookDeliveries(webhookId: string, page: number = 1, perPage: number = 50) {
    return this.request<WebhookDeliveryListResponse>(
      `/api/webhooks/${webhookId}/deliveries?page=${page}&per_page=${perPage}`
    );
  }

  async retryWebhookDelivery(webhookId: string, deliveryId: string) {
    return this.request<WebhookDeliveryItem>(
      `/api/webhooks/${webhookId}/deliveries/${deliveryId}/retry`,
      { method: "POST" }
    );
  }

  async getWebhookEventTypes() {
    return this.request<WebhookEventTypeInfo[]>("/api/webhooks/events");
  }
```

**Step 2: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -30`
Expected: No errors related to webhook types/methods

**Step 3: Commit**

```bash
git add frontend/lib/api.ts
git commit -m "feat: add webhook API methods to frontend client"
```

---

## Task 3: Encrypt Inbound Webhook Secrets

**Files:**
- Modify: `backend/app/api/inbound_webhooks.py`

**Step 1: Add encryption imports and encrypt on create**

At the top of `inbound_webhooks.py`, add the import:

```python
from app.core.secrets import encrypt_webhook_secret, decrypt_webhook_secret
```

In `create_inbound_webhook` (around line 108), change:

```python
# OLD:
        secret=request.secret,
# NEW:
        secret=encrypt_webhook_secret(request.secret) if request.secret else None,
```

**Step 2: Encrypt on update**

In `update_inbound_webhook` (the loop around line 165), add special handling for secret:

Replace the generic field update loop:
```python
    for field in ["name", "description", "source", "processing_mode", "is_active",
                   "secret", "signature_header", "prompt_template"]:
        value = getattr(request, field)
        if value is not None:
            setattr(wh, field, value)
```

With:
```python
    for field in ["name", "description", "source", "processing_mode", "is_active",
                   "signature_header", "prompt_template"]:
        value = getattr(request, field)
        if value is not None:
            setattr(wh, field, value)

    # Encrypt secret separately
    if request.secret is not None:
        wh.secret = encrypt_webhook_secret(request.secret) if request.secret else None
```

**Step 3: Decrypt for signature verification**

In `_verify_signature` function, the `secret` parameter comes from `wh.secret` which is now encrypted. Update the caller in `receive_inbound_webhook` (around line 367):

Change:
```python
        signature_valid = _verify_signature(body, wh.secret, wh.signature_header, headers_dict)
```
To:
```python
        try:
            plain_secret = decrypt_webhook_secret(wh.secret)
        except Exception:
            logger.warning("Failed to decrypt inbound webhook secret for webhook %s", wh.id)
            plain_secret = wh.secret  # Fallback for pre-encryption secrets
        signature_valid = _verify_signature(body, plain_secret, wh.signature_header, headers_dict)
```

**Step 4: Return plaintext secret on creation (shown once)**

In `create_inbound_webhook`, the `InboundWebhookCreatedResponse` already returns `secret=wh.secret`. Since `wh.secret` is now encrypted, change it to return the original plaintext:

Change:
```python
        secret=wh.secret,  # Shown once on creation
```
To:
```python
        secret=request.secret,  # Shown once on creation (plaintext)
```

**Step 5: Commit**

```bash
git add backend/app/api/inbound_webhooks.py
git commit -m "fix: encrypt inbound webhook secrets using Fernet (parity with outbound)"
```

---

## Task 4: Add Payload Size Limit to Public Receiver

**Files:**
- Modify: `backend/app/api/inbound_webhooks.py`

**Step 1: Add size limit constant and check**

Add near the top of the file (after the imports):

```python
MAX_PAYLOAD_SIZE = 1_048_576  # 1 MB
```

In `receive_inbound_webhook`, add before `body = await request.body()`:

```python
    # Reject oversized payloads
    content_length = int(request.headers.get("content-length", 0))
    if content_length > MAX_PAYLOAD_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"Payload too large. Maximum size is {MAX_PAYLOAD_SIZE} bytes.",
        )
```

**Step 2: Commit**

```bash
git add backend/app/api/inbound_webhooks.py
git commit -m "fix: add 1MB payload size limit to inbound webhook receiver"
```

---

## Task 5: Add Delete and Regenerate Confirmation Dialogs

**Files:**
- Modify: `frontend/components/webhooks/InboundWebhookList.tsx`
- Modify: `frontend/components/webhooks/OutboundWebhookList.tsx`

**Step 1: Add confirmation to InboundWebhookList delete and regenerate**

In `InboundWebhookList.tsx`, replace the delete button onClick (line 231):

```tsx
                    onClick={() => deleteMutation.mutate(wh.id)}
```
With:
```tsx
                    onClick={() => {
                      if (confirm("Delete this webhook? All event history will be lost.")) {
                        deleteMutation.mutate(wh.id);
                      }
                    }}
```

Replace the regenerate button onClick (line 223):

```tsx
                    onClick={() => regenerateMutation.mutate(wh.id)}
```
With:
```tsx
                    onClick={() => {
                      if (confirm("Regenerate token? The old webhook URL will stop working immediately.")) {
                        regenerateMutation.mutate(wh.id);
                      }
                    }}
```

**Step 2: Add confirmation to OutboundWebhookList delete**

In `OutboundWebhookList.tsx`, replace the delete button onClick (line 193):

```tsx
                    onClick={() => deleteMutation.mutate(wh.id)}
```
With:
```tsx
                    onClick={() => {
                      if (confirm("Delete this webhook? All delivery history will be lost.")) {
                        deleteMutation.mutate(wh.id);
                      }
                    }}
```

**Step 3: Display regenerated token in InboundWebhookList**

In `InboundWebhookList.tsx`, update the `regenerateMutation` to capture the new webhook URL:

Add state:
```tsx
const [regeneratedUrl, setRegeneratedUrl] = useState<string | null>(null);
```

Update regenerateMutation onSuccess:
```tsx
  const regenerateMutation = useMutation({
    mutationFn: (webhookId: string) => api.regenerateWebhookToken(agentId, webhookId),
    onSuccess: (data) => {
      setRegeneratedUrl(`${window.location.origin}${data.url}`);
      queryClient.invalidateQueries({ queryKey: ["inbound-webhooks", agentId] });
    },
    onError: (err: ApiError) => setError(err.detail),
  });
```

Add display after the `createdWebhook` secret display block:
```tsx
      {regeneratedUrl && (
        <SecretDisplay
          value={regeneratedUrl}
          label="New Webhook URL (save this now — the old URL no longer works)"
        />
      )}
```

**Step 4: Commit**

```bash
git add frontend/components/webhooks/InboundWebhookList.tsx frontend/components/webhooks/OutboundWebhookList.tsx
git commit -m "fix: add confirmation dialogs for delete/regenerate and display new token"
```

---

## Task 6: Sanitize Error Responses

**Files:**
- Modify: `backend/app/main.py`
- Modify: `backend/app/api/inbound_webhooks.py`
- Modify: `backend/app/api/webhooks.py`

**Step 1: Sanitize global error handler**

In `backend/app/main.py`, replace the global exception handler (lines 389-401):

```python
@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    """Global exception handler for unhandled errors."""
    logger.error("Unhandled %s on %s %s: %s", type(exc).__name__, request.method, request.url.path, exc, exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )
```

Add `import logging` and `logger = logging.getLogger("paco.main")` near the top if not already present.

**Step 2: Sanitize inbound webhook agent error**

In `inbound_webhooks.py`, change (around line 440):

```python
        raise HTTPException(status_code=502, detail=f"Agent error: {e}")
```
To:
```python
        raise HTTPException(status_code=502, detail="Agent processing failed")
```

**Step 3: Sanitize outbound webhook retry error**

In `webhooks.py`, change (around line 363):

```python
        raise HTTPException(status_code=500, detail=f"Failed to enqueue retry: {e}")
```
To:
```python
        logger.error("Failed to enqueue webhook retry: %s", e)
        raise HTTPException(status_code=500, detail="Failed to enqueue retry")
```

**Step 4: Commit**

```bash
git add backend/app/main.py backend/app/api/inbound_webhooks.py backend/app/api/webhooks.py
git commit -m "fix: sanitize error responses to prevent internal detail leaks"
```

---

## Task 7: Fix Race Condition on Event Counter

**Files:**
- Modify: `backend/app/api/inbound_webhooks.py`

**Step 1: Use atomic SQL increment**

Change (around lines 449-450):

```python
    wh.total_events = (wh.total_events or 0) + 1
    wh.last_event_at = datetime.now(timezone.utc)
```
To:
```python
    from sqlalchemy import update
    await db.execute(
        update(InboundWebhook)
        .where(InboundWebhook.id == wh.id)
        .values(
            total_events=InboundWebhook.total_events + 1,
            last_event_at=datetime.now(timezone.utc),
        )
    )
```

**Step 2: Commit**

```bash
git add backend/app/api/inbound_webhooks.py
git commit -m "fix: use atomic SQL increment for webhook event counter"
```

---

## Task 8: Validate Outbound Event Types Against Enum

**Files:**
- Modify: `backend/app/schemas/webhooks.py`

**Step 1: Add validator to WebhookCreateRequest**

Add after the `WebhookCreateRequest` class definition:

```python
from pydantic import field_validator

class WebhookCreateRequest(BaseModel):
    name: str = Field(..., max_length=255)
    url: str = Field(..., max_length=2048)
    events: List[str] = Field(..., min_length=1)
    agent_id: Optional[str] = None
    description: Optional[str] = None

    @field_validator("events")
    @classmethod
    def validate_event_types(cls, v: List[str]) -> List[str]:
        valid = {e.value for e in WebhookEventType}
        invalid = [e for e in v if e not in valid]
        if invalid:
            raise ValueError(f"Invalid event types: {invalid}. Valid types: {sorted(valid)}")
        return v
```

Add the same validator to `WebhookUpdateRequest`:

```python
class WebhookUpdateRequest(BaseModel):
    name: Optional[str] = Field(None, max_length=255)
    url: Optional[str] = Field(None, max_length=2048)
    events: Optional[List[str]] = None
    agent_id: Optional[str] = None
    is_active: Optional[bool] = None
    description: Optional[str] = None
    rotate_secret: bool = False

    @field_validator("events")
    @classmethod
    def validate_event_types(cls, v: Optional[List[str]]) -> Optional[List[str]]:
        if v is None:
            return v
        valid = {e.value for e in WebhookEventType}
        invalid = [e for e in v if e not in valid]
        if invalid:
            raise ValueError(f"Invalid event types: {invalid}. Valid types: {sorted(valid)}")
        return v
```

**Step 2: Commit**

```bash
git add backend/app/schemas/webhooks.py
git commit -m "fix: validate outbound webhook event types against enum"
```

---

## Task 9: Add onError to Toggle and Retry Mutations

**Files:**
- Modify: `frontend/components/webhooks/InboundWebhookList.tsx`
- Modify: `frontend/components/webhooks/OutboundWebhookList.tsx`
- Modify: `frontend/components/webhooks/OutboundDeliveryLog.tsx`

**Step 1: Add onError to InboundWebhookList toggleMutation**

```tsx
  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.updateInboundWebhook(agentId, id, { is_active: isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inbound-webhooks", agentId] });
    },
    onError: (err: ApiError) => setError(err.detail),
  });
```

**Step 2: Add onError to OutboundWebhookList toggleMutation**

```tsx
  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.updateOutboundWebhook(id, { is_active: isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["outbound-webhooks", agentId] });
    },
    onError: (err: ApiError) => setError(err.detail),
  });
```

**Step 3: Add onError to OutboundDeliveryLog retryMutation**

Add state and import at top of component:
```tsx
const [error, setError] = useState<string | null>(null);
```

Update the mutation:
```tsx
  const retryMutation = useMutation({
    mutationFn: (deliveryId: string) => api.retryWebhookDelivery(webhookId, deliveryId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["webhook-deliveries", webhookId] });
    },
    onError: (err: ApiError) => setError(err.detail),
  });
```

Add error display at top of the component return:
```tsx
      {error && (
        <div className="p-2 rounded bg-error/10 border border-error/30 text-error text-xs mb-2">
          {error}
        </div>
      )}
```

**Step 4: Commit**

```bash
git add frontend/components/webhooks/InboundWebhookList.tsx frontend/components/webhooks/OutboundWebhookList.tsx frontend/components/webhooks/OutboundDeliveryLog.tsx
git commit -m "fix: add error handling to toggle and retry mutations"
```

---

## Task 10: Fix Webhook URL Copy and Modal UX

**Files:**
- Modify: `frontend/components/webhooks/InboundWebhookList.tsx`
- Modify: `frontend/components/webhooks/OutboundWebhookForm.tsx`

**Step 1: Fix URL copy to use API base URL**

In `InboundWebhookList.tsx`, change the `handleCopyUrl` function:

```tsx
  const handleCopyUrl = async (wh: InboundWebhook) => {
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || window.location.origin;
    await navigator.clipboard.writeText(`${baseUrl}${wh.url}`);
    setCopiedToken(wh.id);
    setTimeout(() => setCopiedToken(null), 2000);
  };
```

**Step 2: Add escape-key and backdrop-click to OutboundWebhookForm**

In `OutboundWebhookForm.tsx`, add an `useEffect` for Escape key and update the backdrop div:

Add after the state declarations:
```tsx
  // Close on Escape key
  React.useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onCancel]);
```

Add `import React from "react"` or use `useEffect` from the existing import.

Update the backdrop div to close on click:
```tsx
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
```

**Step 3: Commit**

```bash
git add frontend/components/webhooks/InboundWebhookList.tsx frontend/components/webhooks/OutboundWebhookForm.tsx
git commit -m "fix: use API base URL for webhook copy and add modal escape/backdrop close"
```

---

## Task 11: Low Severity Polish

**Files:**
- Modify: `backend/app/api/inbound_webhooks.py`
- Modify: `backend/app/api/webhooks.py`
- Modify: `frontend/components/webhooks/InboundWebhookList.tsx`
- Modify: `frontend/components/webhooks/OutboundWebhookList.tsx`
- Modify: `frontend/components/webhooks/EventTypeSelector.tsx`
- Modify: `frontend/components/webhooks/SecretDisplay.tsx`

**Step 1: Filter sensitive headers before storage**

In `inbound_webhooks.py`, change the headers collection (around line 355):

```python
    # Collect headers (lowercased), stripping sensitive values
    SENSITIVE_HEADERS = {"authorization", "cookie", "x-api-key", "x-auth-token"}
    headers_dict = {
        k: v for k, v in request.headers.items()
        if k.lower() not in SENSITIVE_HEADERS
    }
```

**Step 2: Log warning on silent signing failure**

In `webhooks.py`, change the bare `pass` (around lines 230-231):

```python
        except Exception:
            pass
```
To:
```python
        except Exception as e:
            logger.warning("Failed to sign test webhook %s: %s", webhook_id, e)
```

**Step 3: Remove unused ExternalLink import**

In `InboundWebhookList.tsx`, remove `ExternalLink` from the lucide-react import (line 10).

**Step 4: Add accessibility attributes to toggle switches**

In `InboundWebhookList.tsx`, update the toggle button:
```tsx
                <button
                  onClick={() => toggleMutation.mutate({ id: wh.id, isActive: !wh.is_active })}
                  role="switch"
                  aria-checked={wh.is_active}
                  aria-label={`Toggle ${wh.name} active`}
                  className={cn(
```

Same for `OutboundWebhookList.tsx`:
```tsx
                <button
                  onClick={() => toggleMutation.mutate({ id: wh.id, isActive: !wh.is_active })}
                  role="switch"
                  aria-checked={wh.is_active}
                  aria-label={`Toggle ${wh.name} active`}
                  className={cn(
```

In `EventTypeSelector.tsx`, update the category toggle button:
```tsx
            <button
              type="button"
              onClick={() => toggleCategory(category)}
              role="checkbox"
              aria-checked={allSelected ? true : someSelected ? "mixed" : false}
              className="flex items-center gap-2 mb-1.5"
            >
```

**Step 5: Default SecretDisplay to hidden**

In `SecretDisplay.tsx`, change line 12:

```tsx
  const [visible, setVisible] = useState(false);
```

**Step 6: Commit**

```bash
git add backend/app/api/inbound_webhooks.py backend/app/api/webhooks.py frontend/components/webhooks/InboundWebhookList.tsx frontend/components/webhooks/OutboundWebhookList.tsx frontend/components/webhooks/EventTypeSelector.tsx frontend/components/webhooks/SecretDisplay.tsx
git commit -m "fix: filter sensitive headers, add a11y attrs, default secret hidden, remove dead import"
```

---

## Verification Checklist

After all tasks are complete:

1. **TypeScript compiles**: `cd frontend && npx tsc --noEmit`
2. **Backend starts**: `cd backend && python -m app.main` (or equivalent)
3. **Existing tests pass**: `cd backend && python -m pytest tests/ -v`
4. **Manual smoke test**: Navigate to agent detail page, click Webhooks tab, verify list loads without console errors
