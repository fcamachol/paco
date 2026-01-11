import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db/client'

// GET /api/tools - List all tools (marketplace)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category')
    const isPublic = searchParams.get('public')
    const isVerified = searchParams.get('verified')
    const standalone = searchParams.get('standalone')

    const tools = await prisma.tool.findMany({
      where: {
        ...(category && { category }),
        ...(isPublic === 'true' && { isPublic: true }),
        ...(isVerified === 'true' && { isVerified: true }),
        ...(standalone === 'true' && { connectorId: null }),
        ...(standalone === 'false' && { NOT: { connectorId: null } })
      },
      include: {
        connector: {
          select: {
            id: true,
            name: true,
            type: true,
            status: true
          }
        },
        _count: {
          select: {
            agentTools: true,
            toolCalls: true
          }
        }
      },
      orderBy: [
        { isVerified: 'desc' },
        { usageCount: 'desc' },
        { name: 'asc' }
      ]
    })

    return NextResponse.json(tools)
  } catch (error) {
    console.error('Error fetching tools:', error)
    return NextResponse.json(
      { error: 'Failed to fetch tools' },
      { status: 500 }
    )
  }
}

// POST /api/tools - Create new standalone tool
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, slug, description, category, inputSchema, handler, accountId } = body

    if (!name || !slug || !description) {
      return NextResponse.json(
        { error: 'name, slug, and description are required' },
        { status: 400 }
      )
    }

    // Check slug uniqueness
    const existing = await prisma.tool.findUnique({ where: { slug } })
    if (existing) {
      return NextResponse.json(
        { error: 'A tool with this slug already exists' },
        { status: 409 }
      )
    }

    const tool = await prisma.tool.create({
      data: {
        name,
        slug,
        description,
        category: category || 'general',
        inputSchema: inputSchema ? JSON.stringify(inputSchema) : '{}',
        handler: handler || null,
        accountId: accountId || null,
        isPublic: !accountId,
        isVerified: false
      }
    })

    return NextResponse.json(tool, { status: 201 })
  } catch (error) {
    console.error('Error creating tool:', error)
    return NextResponse.json(
      { error: 'Failed to create tool' },
      { status: 500 }
    )
  }
}
