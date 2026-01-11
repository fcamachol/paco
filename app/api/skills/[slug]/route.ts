import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db/client'

interface RouteParams {
  params: Promise<{ slug: string }>
}

// GET /api/skills/[slug] - Get skill by slug
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { slug } = await params

    const skill = await prisma.skill.findUnique({
      where: { slug },
      include: {
        agentSkills: {
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

    if (!skill) {
      return NextResponse.json(
        { error: 'Skill not found' },
        { status: 404 }
      )
    }

    // Parse definition for response
    let definition = {}
    try {
      definition = JSON.parse(skill.definition)
    } catch {
      // Keep empty object
    }

    return NextResponse.json({
      ...skill,
      definition
    })
  } catch (error) {
    console.error('Error fetching skill:', error)
    return NextResponse.json(
      { error: 'Failed to fetch skill' },
      { status: 500 }
    )
  }
}

// PUT /api/skills/[slug] - Update skill
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { slug } = await params
    const body = await request.json()
    const { name, description, type, category, definition, isPublic, version } = body

    const skill = await prisma.skill.update({
      where: { slug },
      data: {
        ...(name && { name }),
        ...(description && { description }),
        ...(type && { type }),
        ...(category && { category }),
        ...(definition && { definition: JSON.stringify(definition) }),
        ...(isPublic !== undefined && { isPublic }),
        ...(version && { version })
      }
    })

    return NextResponse.json(skill)
  } catch (error) {
    console.error('Error updating skill:', error)
    return NextResponse.json(
      { error: 'Failed to update skill' },
      { status: 500 }
    )
  }
}

// DELETE /api/skills/[slug] - Delete skill
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { slug } = await params

    // Check if skill is in use
    const usageCount = await prisma.agentSkill.count({
      where: { skill: { slug } }
    })

    if (usageCount > 0) {
      return NextResponse.json(
        { error: `Skill is in use by ${usageCount} agent(s). Remove from agents first.` },
        { status: 400 }
      )
    }

    await prisma.skill.delete({
      where: { slug }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting skill:', error)
    return NextResponse.json(
      { error: 'Failed to delete skill' },
      { status: 500 }
    )
  }
}
