# PACO Implementation Plan

## Vision
Transform PACO from a UI skeleton into a fully functional visual interface for the Anthropic Agents SDK.

---

## Phase 1: Foundation ✅ COMPLETE

### 1.1 TypeScript Types & Interfaces ✅
- [x] Create `/types/agent.ts` - Agent, Tool, Message, Event types
- [x] Create `/types/conversation.ts` - Conversation, Turn, ToolCall types
- [x] Create `/types/metrics.ts` - Stats, Escalation, Activity types

### 1.2 Database Layer ✅
- [x] Add SQLite via Prisma 6
- [x] Schema: agents, conversations, messages, tool_calls, escalations, metrics
- [x] Seed data for María, TickIt, Copilot agents

### 1.3 Environment & Config ✅
- [x] `.env` with DATABASE_URL
- [x] Config for models (sonnet, haiku, opus)
- [x] Agent configurations stored in DB

---

## Phase 2: Backend API ✅ COMPLETE

### 2.1 Agent CRUD (`/api/agents`) ✅
- [x] GET /api/agents - List all agents
- [x] POST /api/agents - Create new agent
- [x] GET /api/agents/[id] - Get agent details
- [x] PUT /api/agents/[id] - Update agent config
- [x] DELETE /api/agents/[id] - Delete agent

### 2.2 Agent Configuration
- [ ] GET/PUT /api/agents/[id]/prompt - System prompt
- [ ] GET/PUT /api/agents/[id]/tools - Tool configuration
- [ ] GET/PUT /api/agents/[id]/escalation - Escalation rules
- [ ] GET/PUT /api/agents/[id]/workflows - Workflow definitions

### 2.3 Conversations (`/api/conversations`) ✅
- [x] POST /api/conversations - Start new conversation
- [x] GET /api/conversations/[id] - Get conversation history
- [x] POST /api/conversations/[id]/messages - Add message
- [ ] POST /api/conversations/[id]/chat - Send message (streaming)

### 2.4 Metrics & Monitoring (`/api/metrics`) ✅
- [x] GET /api/metrics - Dashboard stats
- [x] GET /api/metrics/activity - Heatmap data
- [x] GET /api/escalations - Recent escalations

### 2.5 Connectors (`/api/connectors`) ✅
- [x] GET /api/connectors - List connectors
- [x] POST /api/connectors - Add connector
- [x] GET /api/connectors/[id] - Get connector details
- [x] PUT /api/connectors/[id] - Update connector
- [x] DELETE /api/connectors/[id] - Delete connector
- [ ] POST /api/connectors/[id]/discover - Discover tools from endpoint

---

## Phase 3: Agents SDK Integration

### 3.1 Core Agent Service (`/lib/agents/`)
- [ ] `agent-factory.ts` - Create agents from DB config
- [ ] `tool-registry.ts` - Register tools from connectors
- [ ] `agent-runner.ts` - Execute agent with streaming

### 3.2 Tool Execution
- [ ] Dynamic tool loading from connectors (REST, SOAP, DB)
- [ ] Tool result caching
- [ ] Error handling & retries

### 3.3 Event Streaming
- [ ] WebSocket or Server-Sent Events for real-time updates
- [ ] Event types: text_delta, tool_call, tool_result, thinking, error
- [ ] Event persistence for monitoring

### 3.4 Escalation Engine
- [ ] Rule-based escalation triggers
- [ ] Sentiment analysis integration
- [ ] Keyword detection
- [ ] Retry limit tracking
- [ ] Human handoff workflow

---

## Phase 4: Frontend Integration

### 4.1 Dashboard (`/dashboard`)
- [ ] Fetch real agent data from API
- [ ] Live stats with SWR/React Query
- [ ] Real activity heatmap from metrics
- [ ] Click agent → navigate to config

### 4.2 Agents List (`/agents`)
- [ ] Real agent list from API
- [ ] Create new agent modal
- [ ] Agent status indicators (live)

### 4.3 Agent Configuration (`/agents/[id]/configure`)
- [ ] **General tab**: Name, description, model selection, temperature
- [ ] **Prompts tab**: System prompt editor with variables
- [ ] **Tools tab**: Enable/disable tools, test tool, view schema
- [ ] **Workflows tab**: Visual workflow builder (stretch goal)
- [ ] **Escalation tab**: Configure triggers & destinations

### 4.4 Connectors (`/connectors`)
- [ ] Add connector wizard (REST, SOAP, DB, Webhook)
- [ ] Auto-discover tools from OpenAPI/WSDL
- [ ] Test connection
- [ ] View discovered tools

### 4.5 Playground (`/playground`)
- [ ] Real streaming chat with selected agent
- [ ] Model selection affects API calls
- [ ] Debug panel shows live:
  - Extracted state/intent
  - Tool calls with timing
  - Token usage & cost
- [ ] Reset conversation
- [ ] Export conversation as JSON

### 4.6 Monitoring (`/monitoring`)
- [ ] Real-time stats from API
- [ ] Live volume chart
- [ ] Category breakdown from actual data
- [ ] Escalation table with:
  - Click to view conversation
  - Resolution actions
  - Assign to human

---

## Phase 5: Advanced Features

### 5.1 Multi-Agent Orchestration
- [ ] Agent routing based on intent
- [ ] Agent handoff (María → TickIt → Copilot)
- [ ] Parallel agent execution

### 5.2 Command Palette (⌘K)
- [ ] Global search agents, conversations, tools
- [ ] Quick actions: new agent, new conversation
- [ ] Navigation shortcuts

### 5.3 Real-time Updates
- [ ] WebSocket connection for live dashboard
- [ ] Push notifications for escalations
- [ ] Live conversation count updates

### 5.4 Authentication & Multi-tenancy
- [ ] User authentication (NextAuth)
- [ ] Organization/workspace support
- [ ] Role-based access (admin, operator, viewer)

---

## Tech Stack

| Layer | Technology | Status |
|-------|------------|--------|
| Database | SQLite (dev) | ✅ |
| ORM | Prisma 6 | ✅ |
| API | Next.js API Routes | ✅ |
| Real-time | Server-Sent Events | Pending |
| State | SWR or TanStack Query | Pending |
| SDK | @anthropic-ai/sdk | Pending |

---

## File Structure (Current)

```
/paco
├── app/
│   ├── api/
│   │   ├── agents/
│   │   │   ├── route.ts           ✅
│   │   │   └── [id]/route.ts      ✅
│   │   ├── connectors/
│   │   │   ├── route.ts           ✅
│   │   │   └── [id]/route.ts      ✅
│   │   ├── conversations/
│   │   │   ├── route.ts           ✅
│   │   │   └── [id]/
│   │   │       ├── route.ts       ✅
│   │   │       └── messages/route.ts ✅
│   │   ├── escalations/route.ts   ✅
│   │   └── metrics/
│   │       ├── route.ts           ✅
│   │       └── activity/route.ts  ✅
│   ├── dashboard/
│   ├── agents/
│   ├── connectors/
│   ├── playground/
│   └── monitoring/
├── components/
│   ├── navigation.tsx
│   └── layout-shell.tsx
├── lib/
│   └── db/client.ts               ✅
├── types/
│   ├── agent.ts                   ✅
│   ├── conversation.ts            ✅
│   ├── metrics.ts                 ✅
│   └── index.ts                   ✅
├── prisma/
│   ├── schema.prisma              ✅
│   ├── seed.ts                    ✅
│   └── migrations/                ✅
└── .env                           ✅
```

---

## Next Steps

1. **Phase 3**: Integrate Anthropic SDK for streaming chat
2. **Phase 4**: Connect frontend pages to live API data
3. Add SWR for data fetching and caching
