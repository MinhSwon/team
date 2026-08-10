import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { errorResponse, requireUser } from '@/lib/authorization'

export async function GET() {
  try {
    const user = await requireUser()
    const memberships = await prisma.groupMembership.findMany({
      where: { userId: user.id },
      include: { group: { include: { memberships: { include: { user: { select: { id: true, name: true, avatar: true } } } }, savedPlaces: true } } },
      orderBy: { joinedAt: 'desc' },
    })
    const groups = memberships.map(({ group, role }) => ({
      id: group.id, name: group.name, description: group.description || '', avatar: group.avatar || '', code: group.code,
      memberCount: group.memberships.length, placeCount: group.savedPlaces.length, role,
      members: group.memberships.map((membership) => ({ id: membership.user.id, name: membership.user.name, avatar: membership.user.avatar || '', role: membership.role })),
    }))
    return NextResponse.json({ success: true, groups })
  } catch (error) { return errorResponse(error) }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const body = await request.json()
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (name.length < 2) return NextResponse.json({ success: false, error: 'Tên nhóm phải có ít nhất 2 ký tự.' }, { status: 400 })
    const group = await prisma.group.create({
      data: {
        name,
        description: typeof body.description === 'string' ? body.description.trim() : undefined,
        createdBy: user.id,
        memberships: { create: { userId: user.id, role: 'OWNER' } },
      },
      include: { memberships: true },
    })
    return NextResponse.json({ success: true, group }, { status: 201 })
  } catch (error) { return errorResponse(error) }
}
