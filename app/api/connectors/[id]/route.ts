import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db/client'

interface RouteParams {
  params: Promise<{ id: string }>
}

// GET /api/connectors/[id] - Get connector details
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params

    const connector = await prisma.connector.findUnique({
      where: { id },
      include: {
        tools: {
          include: {
            agentTools: {
              include: {
                agent: {
                  select: {
                    id: true,
                    name: true
                  }
                }
              }
            }
          }
        }
      }
    })

    if (!connector) {
      return NextResponse.json(
        { error: 'Connector not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(connector)
  } catch (error) {
    console.error('Error fetching connector:', error)
    return NextResponse.json(
      { error: 'Failed to fetch connector' },
      { status: 500 }
    )
  }
}

// PUT /api/connectors/[id] - Update connector
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const body = await request.json()
    const { name, type, status, endpoint, config } = body

    const connector = await prisma.connector.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(type && { type }),
        ...(status && { status }),
        ...(endpoint && { endpoint }),
        ...(config && { config: JSON.stringify(config) })
      },
      include: {
        tools: true
      }
    })

    return NextResponse.json(connector)
  } catch (error) {
    console.error('Error updating connector:', error)
    return NextResponse.json(
      { error: 'Failed to update connector' },
      { status: 500 }
    )
  }
}

// DELETE /api/connectors/[id] - Delete connector
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params

    await prisma.connector.delete({
      where: { id }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting connector:', error)
    return NextResponse.json(
      { error: 'Failed to delete connector' },
      { status: 500 }
    )
  }
}
