import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db/client'

// GET /api/conversations - List conversations
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const agentId = searchParams.get('agentId')
    const status = searchParams.get('status')
    const limit = parseInt(searchParams.get('limit') || '50')

    const conversations = await prisma.conversation.findMany({
      where: {
        ...(agentId && { agentId }),
        ...(status && { status })
      },
      include: {
        agent: {
          select: {
            id: true,
            name: true
          }
        },
        messages: {
          orderBy: {
            createdAt: 'asc'
          },
          take: 1
        },
        _count: {
          select: {
            messages: true,
            toolCalls: true
          }
        }
      },
      orderBy: {
        updatedAt: 'desc'
      },
      take: limit
    })

    return NextResponse.json(conversations)
  } catch (error) {
    console.error('Error fetching conversations:', error)
    return NextResponse.json(
      { error: 'Failed to fetch conversations' },
      { status: 500 }
    )
  }
}

// POST /api/conversations - Start new conversation
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { agentId, metadata } = body

    if (!agentId) {
      return NextResponse.json(
        { error: 'agentId is required' },
        { status: 400 }
      )
    }

    // Verify agent exists
    const agent = await prisma.agent.findUnique({
      where: { id: agentId }
    })

    if (!agent) {
      return NextResponse.json(
        { error: 'Agent not found' },
        { status: 404 }
      )
    }

    const conversation = await prisma.conversation.create({
      data: {
        agentId,
        metadata: metadata ? JSON.stringify(metadata) : '{}'
      },
      include: {
        agent: {
          select: {
            id: true,
            name: true,
            systemPrompt: true
          }
        }
      }
    })

    return NextResponse.json(conversation, { status: 201 })
  } catch (error) {
    console.error('Error creating conversation:', error)
    return NextResponse.json(
      { error: 'Failed to create conversation' },
      { status: 500 }
    )
  }
}
