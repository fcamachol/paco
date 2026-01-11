import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db/client'

interface RouteParams {
  params: Promise<{ id: string }>
}

// GET /api/conversations/[id] - Get conversation with messages
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params

    const conversation = await prisma.conversation.findUnique({
      where: { id },
      include: {
        agent: {
          select: {
            id: true,
            name: true,
            model: true,
            systemPrompt: true
          }
        },
        messages: {
          orderBy: {
            createdAt: 'asc'
          },
          include: {
            toolCalls: true
          }
        },
        toolCalls: {
          orderBy: {
            createdAt: 'asc'
          }
        },
        escalations: true
      }
    })

    if (!conversation) {
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(conversation)
  } catch (error) {
    console.error('Error fetching conversation:', error)
    return NextResponse.json(
      { error: 'Failed to fetch conversation' },
      { status: 500 }
    )
  }
}

// PUT /api/conversations/[id] - Update conversation status
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const body = await request.json()
    const { status, metadata } = body

    const updateData: Record<string, unknown> = {}

    if (status) {
      updateData.status = status
      if (status === 'resolved') {
        updateData.resolvedAt = new Date()
      }
      if (status === 'escalated') {
        updateData.escalatedAt = new Date()
      }
    }

    if (metadata) {
      updateData.metadata = JSON.stringify(metadata)
    }

    const conversation = await prisma.conversation.update({
      where: { id },
      data: updateData,
      include: {
        agent: true,
        _count: {
          select: {
            messages: true
          }
        }
      }
    })

    return NextResponse.json(conversation)
  } catch (error) {
    console.error('Error updating conversation:', error)
    return NextResponse.json(
      { error: 'Failed to update conversation' },
      { status: 500 }
    )
  }
}

// DELETE /api/conversations/[id] - Delete conversation
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params

    await prisma.conversation.delete({
      where: { id }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting conversation:', error)
    return NextResponse.json(
      { error: 'Failed to delete conversation' },
      { status: 500 }
    )
  }
}
