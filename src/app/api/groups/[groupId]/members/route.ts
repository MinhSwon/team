import { NextResponse } from 'next/server'
import { GroupRole } from '@prisma/client'
import { prisma } from '@/lib/db'
import { errorResponse, requireGroupMember, requireUser } from '@/lib/authorization'

type Context = { params: Promise<{ groupId: string }> }

export async function PATCH(request: Request, { params }: Context) {
  try {
    const user = await requireUser()
    const { groupId } = await params
    const actor = await requireGroupMember(groupId, user.id, ['OWNER', 'ADMIN'])
    const body = await request.json()
    const userId = typeof body.userId === 'string' ? body.userId : ''
    const role = typeof body.role === 'string' && Object.values(GroupRole).includes(body.role) ? body.role as GroupRole : null
    const target = userId ? await prisma.groupMembership.findUnique({ where: { groupId_userId: { groupId, userId } } }) : null
    if (!userId || !role || !target) return NextResponse.json({ success: false, error: 'Invalid member role.' }, { status: 400 })

    if (role === GroupRole.OWNER) {
      if (actor.role !== GroupRole.OWNER) return NextResponse.json({ success: false, error: 'Only the owner can transfer ownership.' }, { status: 403 })
      if (userId === user.id) return NextResponse.json({ success: false, error: 'Choose another member.' }, { status: 400 })
      await prisma.$transaction([
        prisma.groupMembership.update({ where: { groupId_userId: { groupId, userId } }, data: { role: GroupRole.OWNER } }),
        prisma.groupMembership.update({ where: { groupId_userId: { groupId, userId: user.id } }, data: { role: GroupRole.ADMIN } }),
      ])
    } else {
      if (target.role === GroupRole.OWNER) return NextResponse.json({ success: false, error: 'Transfer ownership before demoting the owner.' }, { status: 400 })
      if (role === GroupRole.ADMIN && actor.role !== GroupRole.OWNER) return NextResponse.json({ success: false, error: 'Only the owner can grant admin.' }, { status: 403 })
      await prisma.groupMembership.update({ where: { groupId_userId: { groupId, userId } }, data: { role } })
    }

    const membership = await prisma.groupMembership.findUnique({ where: { groupId_userId: { groupId, userId } } })
    return NextResponse.json({ success: true, membership })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function DELETE(request: Request, { params }: Context) {
  try {
    const user = await requireUser()
    const { groupId } = await params
    const actor = await requireGroupMember(groupId, user.id, ['OWNER', 'ADMIN'])
    const userId = new URL(request.url).searchParams.get('userId')
    if (!userId) return NextResponse.json({ success: false, error: 'userId is required.' }, { status: 400 })
    if (userId === user.id) return NextResponse.json({ success: false, error: 'Use the leave endpoint.' }, { status: 400 })
    const target = await prisma.groupMembership.findUnique({ where: { groupId_userId: { groupId, userId } } })
    if (!target || target.role === GroupRole.OWNER || (actor.role === GroupRole.ADMIN && target.role === GroupRole.ADMIN)) return NextResponse.json({ success: false, error: 'Member cannot be removed.' }, { status: 403 })
    await prisma.groupMembership.delete({ where: { groupId_userId: { groupId, userId } } })
    return NextResponse.json({ success: true })
  } catch (error) {
    return errorResponse(error)
  }
}
