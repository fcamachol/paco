import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db/client'

interface RouteParams {
  params: Promise<{ id: string }>
}

// GET /api/agents/[id] - Get agent details
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params

    const agent = await prisma.agent.findUnique({
      where: { id },
      include: {
        config: true,
        agentTools: {
          include: {
            tool: {
              include: {
                connector: true
              }
            }
          },
          orderBy: {
            priority: 'asc'
          }
        },
        _count: {
          select: {
            conversations: true,
            escalations: true
          }
        }
      }
    })

    if (!agent) {
      return NextResponse.json(
        { error: 'Agent not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(agent)
  } catch (error) {
    console.error('Error fetching agent:', error)
    return NextResponse.json(
      { error: 'Failed to fetch agent' },
      { status: 500 }
    )
  }
}

// PUT /api/agents/[id] - Update agent
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const body = await request.json()
    const { name, description, status, model, systemPrompt, temperature, maxTurns } = body

    const agent = await prisma.agent.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(description && { description }),
        ...(status && { status }),
        ...(model && { model }),
        ...(systemPrompt !== undefined && { systemPrompt }),
        ...(temperature !== undefined && { temperature }),
        ...(maxTurns !== undefined && { maxTurns })
      },
      include: {
        config: true,
        agentTools: {
          include: {
            tool: true
          }
        }
      }
    })

    return NextResponse.json(agent)
  } catch (error) {
    console.error('Error updating agent:', error)
    return NextResponse.json(
      { error: 'Failed to update agent' },
      { status: 500 }
    )
  }
}

// DELETE /api/agents/[id] - Delete agent
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params

    await prisma.agent.delete({
      where: { id }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting agent:', error)
    return NextResponse.json(
      { error: 'Failed to delete agent' },
      { status: 500 }
    )
  }
}
