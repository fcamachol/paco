import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db/client'

// GET /api/connectors - List connectors
export async function GET() {
  try {
    const connectors = await prisma.connector.findMany({
      include: {
        tools: {
          select: {
            id: true,
            name: true,
            description: true,
            enabled: true
          }
        },
        _count: {
          select: {
            tools: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    return NextResponse.json(connectors)
  } catch (error) {
    console.error('Error fetching connectors:', error)
    return NextResponse.json(
      { error: 'Failed to fetch connectors' },
      { status: 500 }
    )
  }
}

// POST /api/connectors - Create connector
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, type, endpoint, config } = body

    if (!name || !type || !endpoint) {
      return NextResponse.json(
        { error: 'name, type, and endpoint are required' },
        { status: 400 }
      )
    }

    const connector = await prisma.connector.create({
      data: {
        name,
        type,
        endpoint,
        config: config ? JSON.stringify(config) : '{}'
      }
    })

    return NextResponse.json(connector, { status: 201 })
  } catch (error) {
    console.error('Error creating connector:', error)
    return NextResponse.json(
      { error: 'Failed to create connector' },
      { status: 500 }
    )
  }
}
