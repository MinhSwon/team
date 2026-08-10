import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { errorResponse, requireGroupMember, requireUser } from '@/lib/authorization'

type Context = { params: Promise<{ groupId: string }> }

export async function GET(_request: Request, { params }: Context) {
  try {
    const user = await requireUser(); const { groupId } = await params
    await requireGroupMember(groupId, user.id)
    const group = await prisma.group.findUnique({ where: { id: groupId }, include: {
      memberships: { include: { user: { select: { id: true, name: true, email: true, avatar: true } } }, orderBy: { joinedAt: 'asc' } },
      savedPlaces: { include: { place: { include: { images: true, category: true } }, addedBy: { select: { id: true, name: true } } }, orderBy: { savedAt: 'desc' } },
    } })
    if (!group) return NextResponse.json({ success: false, error: 'Không tìm thấy nhóm.' }, { status: 404 })
    return NextResponse.json({ success: true, group })
  } catch (error) { return errorResponse(error) }
}

export async function PATCH(request: Request, { params }: Context) {
  try {
    const user = await requireUser(); const { groupId } = await params
    await requireGroupMember(groupId, user.id, ['OWNER', 'ADMIN'])
    const body = await request.json()
    const data = { ...(typeof body.name === 'string' ? { name: body.name.trim() } : {}), ...(typeof body.description === 'string' ? { description: body.description.trim() } : {}) }
    const group = await prisma.group.update({ where: { id: groupId }, data })
    return NextResponse.json({ success: true, group })
  } catch (error) { return errorResponse(error) }
}

export async function DELETE(_request: Request, { params }: Context) {
  try {
    const user = await requireUser(); const { groupId } = await params
    await requireGroupMember(groupId, user.id, ['OWNER'])
    await prisma.group.delete({ where: { id: groupId } })
    return NextResponse.json({ success: true })
  } catch (error) { return errorResponse(error) }
}
