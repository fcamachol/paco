# PACO

> **P**retty **A**dvanced **C**ognitive **O**rchestrator
>
> Transform any system into an agentic system

## Quick Start

```bash
pnpm install
pnpm dev
```

## Overview

PACO is an agentic transformation platform that converts any system (especially legacy government systems) into AI-native applications through intelligent agents, connectors, and workflows.

## Design System

**Theme: Claude Code aesthetic**
- Ultra dark backgrounds (#0d0d0d base)
- Coral accent (#e07a5f)
- Monospace typography (JetBrains Mono)
- Minimal, data-dense UI

## Pages

- `/dashboard` - Agents list, activity heatmap, stats
- `/playground` - Chat testing with debug panel
- `/agents/[id]/configure` - Agent configuration
- `/monitoring` - Analytics and escalation logs

## Agent Types

1. **Customer Agents** - External-facing (María for CEA)
2. **Ticket Intelligence** - Auto-routing (TickIt)
3. **Admin Copilot** - Full system control

## Tech Stack

- Next.js 14 (App Router)
- Tailwind CSS
- TypeScript
- Claude SDK (backend)
