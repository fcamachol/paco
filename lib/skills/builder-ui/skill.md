# PACO Builder UI Skill

## Interface Philosophy
Hybrid agent builder: AI-assisted chat + visual canvas + inspector.
Chat drives creation, canvas shows architecture, inspector enables deep editing.
Dark theme (coral accent). Monospace typography. Progressive disclosure.

## Layout Structure
```
┌─────────────────────────────────────────────────────────────────────────┐
│  / playground                                    [▷ Test] [◈ Build]     │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────┐  ┌─────────────────────────────────────────┐  │
│  │                     │  │              CANVAS                      │  │
│  │   CONVERSATION      │  │   (Visual agent architecture)            │  │
│  │                     │  │                                          │  │
│  │   Chat with the     │  │   ┌─────────┐      ┌─────────┐          │  │
│  │   builder agent     │  │   │ Trigger │──────│ Router  │──> ...   │  │
│  │   to create and     │  │   └─────────┘      └─────────┘          │  │
│  │   modify agents     │  │                                          │  │
│  │                     │  │   [zoom] [pan] [fit]                     │  │
│  │                     │  ├──────────────────────────────────────────┤  │
│  │                     │  │              INSPECTOR                   │  │
│  │                     │  │   Context-sensitive editing panel        │  │
│  │   [input...]  [send]│  │   Shows selected node/tool details       │  │
│  └─────────────────────┘  └─────────────────────────────────────────┘  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## Core Views

### 1. Conversation Panel (Left)
- Chat interface with builder agent
- User describes what they want to build
- Agent asks clarifying questions, suggests tools
- Shows tool calls inline with expandable input/output
- Drives agent creation through natural language

### 2. Canvas (Right Top)
- Read-only visual representation of agent architecture
- Auto-generated from chat actions
- Nodes: Trigger, Router, Tool, Prompt, Guardrail, Human Review
- Click node to select → opens details in Inspector
- Zoom/pan controls bottom-right

### 3. Inspector (Right Bottom)
- Context-sensitive to selected canvas node
- Tabs: Config | Input/Output | Test
- Editable forms with immediate validation
- **Tool nodes**: Show tool schema, parameters, example calls
- **Workflow nodes**: Show step details, conditions
- Collapsible sections for complex configs

### 4. Agent Preview Sidebar (Collapsible)
- Shows current agent draft summary
- Sections: Persona, Tools, Skills, Workflows, Guardrails, Tests
- Each item clickable → selects on canvas, opens inspector
- Status indicators (building/testing/ready)
- Quick actions: Test Agent, Deploy

## Key Interactions

### Creating an Agent (Chat-Driven)
1. User types "I need an agent that handles leak reports"
2. Builder agent asks clarifying questions
3. Agent suggests tools from available connectors
4. User confirms, builder calls `create_agent` tool
5. Canvas updates to show new agent structure
6. Inspector shows agent config for fine-tuning

### Clicking a Tool (Inspector Deep Dive)
1. User clicks tool node on canvas OR tool in preview sidebar
2. Inspector panel opens with tool details:
   ```
   ┌─────────────────────────────────────────┐
   │ TOOL: create_ticket                     │
   ├─────────────────────────────────────────┤
   │ Source: AGORA Connector                 │
   │ Status: ● Connected                     │
   ├─────────────────────────────────────────┤
   │ PARAMETERS                              │
   │ ├─ category (string, required)          │
   │ │   └─ Ticket category code             │
   │ ├─ description (string, required)       │
   │ │   └─ Issue description                │
   │ ├─ address (string, optional)           │
   │ │   └─ Location of the issue            │
   │ └─ priority (enum: low|medium|high)     │
   ├─────────────────────────────────────────┤
   │ RETURNS                                 │
   │ └─ { ticket_id, status, created_at }    │
   ├─────────────────────────────────────────┤
   │ EXAMPLE CALL                            │
   │ {                                       │
   │   "category": "FUG",                    │
   │   "description": "Water leak on...",   │
   │   "priority": "high"                    │
   │ }                                       │
   ├─────────────────────────────────────────┤
   │ OPTIONS                                 │
   │ ☑ Requires human approval (HITL)        │
   │ ☐ Log all calls                         │
   │ ☐ Rate limit: [___] calls/min           │
   ├─────────────────────────────────────────┤
   │ [Test Tool]  [Remove from Agent]        │
   └─────────────────────────────────────────┘
   ```
3. User can edit options, test tool, or remove it

### Adding Tools via Chat
1. User: "Add a tool to check account balance"
2. Builder: "I found `get_balance` from CEA SOAP. Adding it now."
3. Canvas updates with new tool node
4. Inspector auto-opens showing tool details

### Adding Tools via Chat
1. User: "Add the create_ticket tool"
2. Builder confirms and adds tool
3. Canvas auto-updates to show new tool node
4. User can click node to view details in inspector

### Editing Workflows
1. Click workflow node on canvas
2. Inspector shows workflow steps
3. ASCII or visual mini-diagram of flow
4. Click step to drill down
5. Edit conditions, add branches

### Testing
1. Click "Test Agent" button
2. Split view: left = test chat, right = live trace
3. Type message, see agent response
4. Trace shows: tool calls, thinking, guardrail checks
5. Click trace item → shows in inspector with full details

## Component Specs

### Canvas Node
```
┌──────────────────┐
│ ● Tool           │  ← Icon + type
│ create_ticket    │  ← Name
│ [HITL]           │  ← Badge if approval required
└──────────────────┘
   ○               ← Output port
```
- 160px wide, auto height
- Selected: coral border + subtle glow
- Error: red border
- Click: select and view in inspector
- Read-only (all modifications via chat)

### Inspector Panel
- Sticky header with node type + name
- Tabs for different views (Config, I/O, Test)
- Label above input, not floating
- Monospace for code/JSON fields
- Inline validation messages
- Changes save on blur (optimistic)

### Tool List Item (in Preview Sidebar)
```
├─ ☑ create_ticket    →
```
- Checkbox for enable/disable
- Arrow indicates clickable (opens inspector)
- Hover shows brief description tooltip

## States

### Empty States
- No agent: Canvas shows "Describe your agent in chat to get started"
- No tools: "Ask the builder to add tools, or drag from the palette"
- No guardrails: "⚠️ Consider adding safety rules before deploying"

### Loading
- Skeleton loaders for lists and inspector
- Spinner on buttons during async ops
- Canvas nodes show pulse animation when updating

### Errors
- Inline for field validation
- Toast for system errors
- Modal for destructive confirmations

## Color Tokens
```
--bg-base: #0d0d0d
--bg-surface: #141414
--bg-elevated: #1a1a1a
--border: #2a2a2a
--text-primary: #fafafa
--text-muted: #888
--accent: #e07a5f (coral)
--success: #22c55e
--warning: #eab308
--error: #ef4444
```

## Typography
- All text: JetBrains Mono (monospace)
- Headings: 600 weight
- Body: 400 weight
- Code blocks: slightly smaller size

## Tech Stack
- React + TypeScript
- Tailwind CSS
- React Flow for canvas
- Existing component system (btn, input, etc.)
- State: React useState + context (or Zustand if needed)
