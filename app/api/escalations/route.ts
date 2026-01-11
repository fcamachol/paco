import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db/client'

// GET /api/escalations - List escalations
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const resolution = searchParams.get('resolution')
    const agentId = searchParams.get('agentId')
    const limit = parseInt(searchParams.get('limit') || '50')

    const escalations = await prisma.escalation.findMany({
      where: {
        ...(resolution && { resolution }),
        ...(agentId && { agentId })
      },
      include: {
        agent: {
          select: {
            id: true,
            name: true
          }
        },
        conversation: {
          select: {
            id: true,
            status: true,
            createdAt: true,
            messages: {
              take: 1,
              orderBy: { createdAt: 'asc' },
              select: {
                content: true
              }
            }
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: limit
    })

    return NextResponse.json(escalations)
  } catch (error) {
    console.error('Error fetching escalations:', error)
    return NextResponse.json(
      { error: 'Failed to fetch escalations' },
      { status: 500 }
    )
  }
}

// POST /api/escalations - Create escalation
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { conversationId, agentId, reason, category } = body

    if (!conversationId || !agentId || !reason) {
      return NextResponse.json(
        { error: 'conversationId, agentId, and reason are required' },
        { status: 400 }
      )
    }

    // Create escalation and update conversation
    const [escalation] = await prisma.$transaction([
      prisma.escalation.create({
        data: {
          conversationId,
          agentId,
          reason,
          category: category || 'general'
        },
        include: {
          agent: true,
          conversation: true
        }
      }),
      prisma.conversation.update({
        where: { id: conversationId },
        data: {
          status: 'escalated',
          escalatedAt: new Date()
        }
      })
    ])

    return NextResponse.json(escalation, { status: 201 })
  } catch (error) {
    console.error('Error creating escalation:', error)
    return NextResponse.json(
      { error: 'Failed to create escalation' },
      { status: 500 }
    )
  }
}
