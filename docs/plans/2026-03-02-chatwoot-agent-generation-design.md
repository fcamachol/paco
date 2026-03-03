# Chatwoot Agent Generation Design

**Date**: 2026-03-02
**Goal**: Make PACO able to generate agents with full Chatwoot webhook capabilities matching maria-cea-aws

## Background

maria-cea-aws on gcp-cea is a TypeScript agent (Claude Agent SDK + Express) that receives Chatwoot webhooks, processes messages (including audio/image/video), routes through skill-based classification, and responds back via Chatwoot API. PACO's template system already has basic Chatwoot support gated behind `webhooks.get("chatwoot")`, but the gate is permanently closed because `webhook_config` doesn't exist on the Agent model. Even if enabled, the current template implementation is too basic.

## Approach: Enhance Templates + Add Missing Model Fields

Config-driven enhancement following PACO's existing architecture. Any agent can opt into full Chatwoot capabilities by setting `webhook_config.chatwoot`.

## 1. Database & Model Changes

### New columns on Agent model (`models.py`)

```python
webhook_config = mapped_column(JSONB, default=dict)
conversation_rules = mapped_column(Text, default="")
classifier_config = mapped_column(JSONB, default=dict)
```

### webhook_config schema

```json
{
  "chatwoot": {
    "url": "https://agora.ceaqueretaro.gob.mx",
    "account_id": 1,
    "filter_open_conversations": true,
    "multi_message_delay_ms": 1500,
    "media_processing": {
      "audio_transcription": true,
      "image_analysis": true,
      "video_analysis": true
    }
  }
}
```

Secrets (`CHATWOOT_API_TOKEN`, `OPENAI_API_KEY`, `GEMINI_API_KEY`) go into `env_vars`, never baked into config.

### Alembic migration

Add 3 nullable JSONB/Text columns with defaults to `agents` table.

## 2. Template Changes — TypeScript Runtime

### New files

**`src/chatwoot.ts.j2`** — Full Chatwoot integration module:
- `shouldProcessWebhook()` — Filters: `message_created` only, `incoming` only, skips `user`/`agent_bot` senders, skips `open` conversations (configurable via `filter_open_conversations`), dedup with in-memory Set + 60s TTL
- `extractMessageContent()` — Text + attachments extraction
- `processAttachments()` — Delegates to media module, handles location/file/contact
- `buildChatwootContext()` — Maps payload to conversationId, accountId, sender info, custom attributes, inbox, channel
- `sendToChatwoot()` — POST to Chatwoot API with `api_access_token` header, `message_type: "outgoing"`
- `updateConversationStatus()` — PATCH for human handoff (open/pending/resolved/snoozed)
- `getChatwootStatus()` — Health/config check

**`src/media.ts.j2`** — Media processing module (gated by `webhooks.chatwoot.media_processing`):
- `downloadMedia()` — Fetch binary with retry (3 attempts)
- `transcribeAudio()` — OpenAI Whisper API (`whisper-1`)
- `analyzeImage()` — Claude Vision two-pass: classify (meter/leak/receipt/unrelated) → specialist analysis
- `analyzeVideo()` — Gemini API single-pass analysis
- `processMediaAttachments()` — Routes by `file_type` to appropriate handler

### Modified files

**`src/server.ts.j2`** — Enhanced Chatwoot handler:
- Import from `chatwoot.ts` module (not inline)
- Fire-and-forget: respond `200 {received: true}` immediately
- Full `shouldProcessWebhook()` filtering
- Context extraction + attachment processing
- Multi-message response with configurable delay between messages
- Error recovery: sends apology message on failure

**`src/types.ts.j2`** — Full Chatwoot type definitions:
- `ChatwootWebhookPayload` with all nested interfaces
- `ChatwootSender` (id, name, type, phone_number, email, custom_attributes)
- `ChatwootConversation` (id, status, channel, inbox_id)
- `ChatwootAccount`, `ChatwootInbox`
- `ChatwootAttachment` (file_type, data_url, coordinates, etc.)

**`src/config/index.ts.j2`** — Add chatwoot config properties:
- `chatwootUrl`, `chatwootToken`, `chatwootAccountId`
- `chatwootFilterOpenConversations`, `chatwootMultiMessageDelayMs`
- Media API key references

**`package.json.j2`** — Conditional dependencies:
- `@anthropic-ai/sdk` (for Claude Vision, always present)
- `@google/generative-ai` (for Gemini video analysis, when media_processing.video_analysis)
- `undici` (for fetch in older Node versions if needed)

## 3. Template Changes — Python Runtime

Same pattern applied:

**`chatwoot.py.j2`** — Python equivalent using `httpx`
**`media.py.j2`** — Python media processing using `httpx` + `anthropic` + `google.generativeai`
**`main.py.j2`** — Enhanced `/chatwoot` endpoint
**`config.py.j2`** — Chatwoot Pydantic settings
**`requirements.txt.j2`** — Conditional deps: `anthropic`, `google-generativeai`

## 4. Backend API Changes

**Schemas** (`schemas/`):
- Add `webhook_config: Optional[Dict]` to `AgentCreate` and `AgentUpdate`
- Add validation for `webhook_config.chatwoot` structure

**Agent Generator** (`agent_generator.py`):
- No changes needed — already reads `agent.webhook_config or {}` as `webhooks`

## 5. Frontend Changes

**Agent config/webhooks tab**:
- Add "Chatwoot Integration" config section
- Fields: Chatwoot URL, Account ID, conversation status filter toggle, media processing toggles
- Token configured via existing env vars UI

## Feature Mapping: maria-cea-aws → PACO Generated Agent

| maria-cea-aws Feature | PACO Implementation |
|---|---|
| `POST /chatwoot` endpoint | `server.ts.j2` with `{% if webhooks.get("chatwoot") %}` |
| `shouldProcessWebhook()` filtering | `chatwoot.ts.j2` — same logic |
| Immediate 200 response | `server.ts.j2` — fire-and-forget pattern |
| `buildChatwootContext()` | `chatwoot.ts.j2` — same extraction |
| Audio transcription (Whisper) | `media.ts.j2` — same API calls |
| Image analysis (Claude Vision) | `media.ts.j2` — two-pass classify→analyze |
| Video analysis (Gemini) | `media.ts.j2` — single-pass analysis |
| Multi-message response | `server.ts.j2` — configurable delay loop |
| Human handoff | `chatwoot.ts.j2` — `updateConversationStatus()` |
| Error recovery message | `server.ts.j2` — try/catch with sendToChatwoot fallback |
| Duplicate detection | `chatwoot.ts.j2` — in-memory Set with TTL |
| Conversation memory | Existing `memory.ts.j2` (SQLite-based, enhanced) |
| Skill classification | Existing `classifier.ts.j2` |
| MCP tool execution | Existing `tools.ts.j2` |

## Success Criteria

1. Creating an agent with `webhook_config.chatwoot` set generates a fully functional Chatwoot-integrated agent
2. Generated agent handles all webhook events maria-cea-aws handles
3. Generated agent processes audio, image, and video attachments
4. Generated agent responds back to Chatwoot with multi-message support
5. Generated agent supports human handoff via conversation status
6. Generated agent filters duplicates and ignores bot/agent messages
7. Both TypeScript and Python runtimes supported
