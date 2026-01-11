import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db/client'
import { toolRegistry } from '@/lib/tools'

interface RouteParams {
  params: Promise<{ slug: string }>
}

// GET /api/tools/[slug] - Get tool by slug
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { slug } = await params

    const tool = await prisma.tool.findUnique({
      where: { slug },
      include: {
        connector: true,
        agentTools: {
          include: {
            agent: {
              select: {
                id: true,
                name: true,
                status: true
              }
            }
          }
        }
      }
    })

    if (!tool) {
      return NextResponse.json(
        { error: 'Tool not found' },
        { status: 404 }
      )
    }

    // Parse input schema for response
    let inputSchema = {}
    try {
      inputSchema = JSON.parse(tool.inputSchema)
    } catch {
      // Keep empty object
    }

    return NextResponse.json({
      ...tool,
      inputSchema
    })
  } catch (error) {
    console.error('Error fetching tool:', error)
    return NextResponse.json(
      { error: 'Failed to fetch tool' },
      { status: 500 }
    )
  }
}

// PUT /api/tools/[slug] - Update tool
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { slug } = await params
    const body = await request.json()
    const { name, description, category, inputSchema, handler, isPublic, enabled } = body

    const tool = await prisma.tool.update({
      where: { slug },
      data: {
        ...(name && { name }),
        ...(description && { description }),
        ...(category && { category }),
        ...(inputSchema && { inputSchema: JSON.stringify(inputSchema) }),
        ...(handler !== undefined && { handler }),
        ...(isPublic !== undefined && { isPublic }),
        ...(enabled !== undefined && { enabled })
      }
    })

    return NextResponse.json(tool)
  } catch (error) {
    console.error('Error updating tool:', error)
    return NextResponse.json(
      { error: 'Failed to update tool' },
      { status: 500 }
    )
  }
}

// DELETE /api/tools/[slug] - Delete tool
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { slug } = await params

    // Check if tool is in use
    const usageCount = await prisma.agentTool.count({
      where: { tool: { slug } }
    })

    if (usageCount > 0) {
      return NextResponse.json(
        { error: `Tool is in use by ${usageCount} agent(s). Remove from agents first.` },
        { status: 400 }
      )
    }

    await prisma.tool.delete({
      where: { slug }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting tool:', error)
    return NextResponse.json(
      { error: 'Failed to delete tool' },
      { status: 500 }
    )
  }
}

// POST /api/tools/[slug] - Execute tool (test mode)
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { slug } = await params
    const body = await request.json()
    const { input } = body

    const tool = await toolRegistry.getBySlug(slug)
    if (!tool) {
      return NextResponse.json(
        { error: 'Tool not found' },
        { status: 404 }
      )
    }

    const result = await tool.handler(input || {})

    return NextResponse.json({
      tool: slug,
      input,
      result
    })
  } catch (error) {
    console.error('Error executing tool:', error)
    return NextResponse.json(
      { error: 'Failed to execute tool' },
      { status: 500 }
    )
  }
}
