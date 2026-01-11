import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db/client'

// GET /api/agents - List all agents
export async function GET() {
  try {
    const agents = await prisma.agent.findMany({
      include: {
        config: true,
        agentTools: {
          include: {
            tool: true
          }
        },
        _count: {
          select: {
            conversations: true,
            escalations: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    return NextResponse.json(agents)
  } catch (error) {
    console.error('Error fetching agents:', error)
    return NextResponse.json(
      { error: 'Failed to fetch agents' },
      { status: 500 }
    )
  }
}

// POST /api/agents - Create new agent
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, description, model, systemPrompt, temperature, maxTurns } = body

    if (!name || !description) {
      return NextResponse.json(
        { error: 'Name and description are required' },
        { status: 400 }
      )
    }

    const agent = await prisma.agent.create({
      data: {
        name,
        description,
        model: model || 'claude-sonnet-4-20250514',
        systemPrompt: systemPrompt || '',
        temperature: temperature ?? 0.7,
        maxTurns: maxTurns ?? 10,
        config: {
          create: {
            escalationRules: '[]'
          }
        }
      },
      include: {
        config: true
      }
    })

    return NextResponse.json(agent, { status: 201 })
  } catch (error) {
    console.error('Error creating agent:', error)
    return NextResponse.json(
      { error: 'Failed to create agent' },
      { status: 500 }
    )
  }
}
