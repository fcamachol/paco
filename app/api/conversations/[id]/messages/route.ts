import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db/client'

interface RouteParams {
  params: Promise<{ id: string }>
}

// GET /api/conversations/[id]/messages - Get messages for a conversation
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params

    const messages = await prisma.message.findMany({
      where: { conversationId: id },
      include: {
        toolCalls: true
      },
      orderBy: {
        createdAt: 'asc'
      }
    })

    return NextResponse.json(messages)
  } catch (error) {
    console.error('Error fetching messages:', error)
    return NextResponse.json(
      { error: 'Failed to fetch messages' },
      { status: 500 }
    )
  }
}

// POST /api/conversations/[id]/messages - Add message to conversation
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const body = await request.json()
    const { role, content } = body

    if (!role || !content) {
      return NextResponse.json(
        { error: 'role and content are required' },
        { status: 400 }
      )
    }

    // Verify conversation exists
    const conversation = await prisma.conversation.findUnique({
      where: { id }
    })

    if (!conversation) {
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404 }
      )
    }

    const message = await prisma.message.create({
      data: {
        conversationId: id,
        role,
        content
      }
    })

    // Update conversation timestamp
    await prisma.conversation.update({
      where: { id },
      data: { updatedAt: new Date() }
    })

    return NextResponse.json(message, { status: 201 })
  } catch (error) {
    console.error('Error creating message:', error)
    return NextResponse.json(
      { error: 'Failed to create message' },
      { status: 500 }
    )
  }
}
