import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db/client'

// GET /api/skills - List all skills
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category')
    const type = searchParams.get('type')
    const isPublic = searchParams.get('public')
    const isVerified = searchParams.get('verified')

    const skills = await prisma.skill.findMany({
      where: {
        ...(category && { category }),
        ...(type && { type }),
        ...(isPublic === 'true' && { isPublic: true }),
        ...(isVerified === 'true' && { isVerified: true })
      },
      include: {
        _count: {
          select: {
            agentSkills: true
          }
        }
      },
      orderBy: [
        { isVerified: 'desc' },
        { usageCount: 'desc' },
        { name: 'asc' }
      ]
    })

    return NextResponse.json(skills)
  } catch (error) {
    console.error('Error fetching skills:', error)
    return NextResponse.json(
      { error: 'Failed to fetch skills' },
      { status: 500 }
    )
  }
}

// POST /api/skills - Create new skill
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, slug, description, type, category, definition, accountId } = body

    if (!name || !slug || !description || !type || !category) {
      return NextResponse.json(
        { error: 'name, slug, description, type, and category are required' },
        { status: 400 }
      )
    }

    // Check slug uniqueness
    const existing = await prisma.skill.findUnique({ where: { slug } })
    if (existing) {
      return NextResponse.json(
        { error: 'A skill with this slug already exists' },
        { status: 409 }
      )
    }

    const skill = await prisma.skill.create({
      data: {
        name,
        slug,
        description,
        type,
        category,
        definition: definition ? JSON.stringify(definition) : '{}',
        accountId: accountId || null,
        isPublic: !accountId, // Public if no account
        isVerified: false
      }
    })

    return NextResponse.json(skill, { status: 201 })
  } catch (error) {
    console.error('Error creating skill:', error)
    return NextResponse.json(
      { error: 'Failed to create skill' },
      { status: 500 }
    )
  }
}
