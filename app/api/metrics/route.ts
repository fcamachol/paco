import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db/client'

// GET /api/metrics - Get dashboard stats
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const timeRange = searchParams.get('timeRange') || '7d'
    const agentId = searchParams.get('agentId')

    // Calculate date range
    const now = new Date()
    const startDate = new Date()
    switch (timeRange) {
      case '24h':
        startDate.setHours(startDate.getHours() - 24)
        break
      case '7d':
        startDate.setDate(startDate.getDate() - 7)
        break
      case '30d':
        startDate.setDate(startDate.getDate() - 30)
        break
      case '90d':
        startDate.setDate(startDate.getDate() - 90)
        break
      default:
        startDate.setDate(startDate.getDate() - 7)
    }

    // Get conversation stats
    const conversationWhere = {
      createdAt: { gte: startDate },
      ...(agentId && { agentId })
    }

    const [totalConversations, resolvedConversations, escalatedConversations] = await Promise.all([
      prisma.conversation.count({ where: conversationWhere }),
      prisma.conversation.count({ where: { ...conversationWhere, status: 'resolved' } }),
      prisma.conversation.count({ where: { ...conversationWhere, status: 'escalated' } })
    ])

    // Get daily metrics for the period
    const dailyMetrics = await prisma.dailyMetrics.findMany({
      where: {
        date: { gte: startDate }
      },
      orderBy: { date: 'asc' }
    })

    // Calculate aggregates
    const totalTokens = dailyMetrics.reduce((sum, d) => sum + d.totalTokens, 0)
    const avgResponseMs = dailyMetrics.length > 0
      ? Math.round(dailyMetrics.reduce((sum, d) => sum + d.avgResponseMs, 0) / dailyMetrics.length)
      : 0

    // Find peak hour from hourly activity
    const hourlyActivity = await prisma.hourlyActivity.groupBy({
      by: ['timestamp'],
      where: {
        timestamp: { gte: startDate },
        ...(agentId && { agentId })
      },
      _sum: {
        count: true
      },
      orderBy: {
        _sum: {
          count: 'desc'
        }
      },
      take: 1
    })

    const peakHour = hourlyActivity[0]
      ? new Date(hourlyActivity[0].timestamp).getHours()
      : 12

    // Get agent-specific stats
    const agentStats = await prisma.agent.findMany({
      where: agentId ? { id: agentId } : undefined,
      select: {
        id: true,
        name: true,
        _count: {
          select: {
            conversations: true,
            escalations: true
          }
        }
      }
    })

    return NextResponse.json({
      stats: {
        conversations: totalConversations,
        resolved: resolvedConversations,
        resolvedPercent: totalConversations > 0
          ? Math.round((resolvedConversations / totalConversations) * 100)
          : 0,
        escalated: escalatedConversations,
        escalatedPercent: totalConversations > 0
          ? Math.round((escalatedConversations / totalConversations) * 100)
          : 0,
        totalTokens,
        avgResponseMs,
        peakHour
      },
      dailyMetrics,
      agentStats: agentStats.map(a => ({
        agentId: a.id,
        name: a.name,
        conversations: a._count.conversations,
        escalated: a._count.escalations
      })),
      timeRange,
      startDate: startDate.toISOString(),
      endDate: now.toISOString()
    })
  } catch (error) {
    console.error('Error fetching metrics:', error)
    return NextResponse.json(
      { error: 'Failed to fetch metrics' },
      { status: 500 }
    )
  }
}
