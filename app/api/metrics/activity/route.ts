import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db/client'

// GET /api/metrics/activity - Get heatmap data
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const weeks = parseInt(searchParams.get('weeks') || '52')
    const agentId = searchParams.get('agentId')

    const now = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - (weeks * 7))

    // Get hourly activity data
    const activity = await prisma.hourlyActivity.findMany({
      where: {
        timestamp: { gte: startDate },
        ...(agentId && { agentId })
      },
      orderBy: { timestamp: 'asc' }
    })

    // Group by day
    const dailyActivity: Record<string, number> = {}
    activity.forEach(a => {
      const day = a.timestamp.toISOString().split('T')[0]
      dailyActivity[day] = (dailyActivity[day] || 0) + a.count
    })

    // Build heatmap grid (weeks x 7 days)
    const heatmapData: number[][] = []
    const currentDate = new Date(startDate)

    for (let week = 0; week < weeks; week++) {
      const weekData: number[] = []
      for (let day = 0; day < 7; day++) {
        const dateStr = currentDate.toISOString().split('T')[0]
        weekData.push(dailyActivity[dateStr] || 0)
        currentDate.setDate(currentDate.getDate() + 1)
      }
      heatmapData.push(weekData)
    }

    // Calculate max value for scaling
    const maxValue = Math.max(...Object.values(dailyActivity), 1)

    return NextResponse.json({
      weeks: heatmapData,
      maxValue,
      startDate: startDate.toISOString(),
      endDate: now.toISOString()
    })
  } catch (error) {
    console.error('Error fetching activity:', error)
    return NextResponse.json(
      { error: 'Failed to fetch activity' },
      { status: 500 }
    )
  }
}
