# PACO

> **P**retty **A**dvanced **C**ognitive **O**rchestrator

Transform any system into an agentic system. Built for government legacy systems.

![Claude Code Aesthetic](https://img.shields.io/badge/design-Claude%20Code-e07a5f)
![Next.js 14](https://img.shields.io/badge/Next.js-14-black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)

## Quick Start

```bash
git clone https://github.com/fcamachol/paco.git
cd paco
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000)

## Pages

| Route | Description |
|-------|-------------|
| `/dashboard` | Agent cards, activity heatmap, stats |
| `/agents` | List all agents with status |
| `/agents/[id]/configure` | Configure agent tools, prompts, workflows |
| `/connectors` | Manage data source connections |
| `/playground` | Test conversations with debug panel |
| `/monitoring` | Analytics, charts, escalation logs |

## Agent Types

1. **Customer Agents** - External-facing (e.g., María for CEA water utility)
2. **Ticket Intelligence** - Auto-routing & classification (TickIt)
3. **Admin Copilot** - Full database access for operators

## Design System

Claude Code aesthetic with ultra-dark theme and coral accents:

```css
--bg-primary: #0d0d0d
--accent: #e07a5f
--text-primary: #e5e5e5
```

- Monospace typography (JetBrains Mono)
- Minimal chrome, maximum data density
- GitHub-style heatmaps
- Tree structures with `├─` and `└─`

## Tech Stack

**Frontend**
- Next.js 14 (App Router)
- Tailwind CSS
- TypeScript

**Backend** (coming soon)
- Python + FastAPI
- Claude SDK
- PostgreSQL

## Project Structure

```
paco/
├── app/
│   ├── dashboard/       # Main dashboard
│   ├── agents/          # Agent management
│   ├── connectors/      # Data sources
│   ├── playground/      # Chat testing
│   └── monitoring/      # Analytics
├── components/          # Shared components
├── styles/
│   └── globals.css      # Design system
└── CLAUDE.md            # Claude Code context
```

## Integrations

- **AGORA** - Ticket system (Chatwoot fork)
- **CEA SOAP** - Water utility backend
- **Claude API** - Primary LLM
- **Azure Lightning** - Alternative model
- **Tinker** - Fine-tuning

## License

MIT
