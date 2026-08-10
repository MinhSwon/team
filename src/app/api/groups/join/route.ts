import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { errorResponse, requireUser } from '@/lib/authorization'

export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const body = await request.json()
    const code = typeof body.code === 'string' ? body.code.trim() : ''
    if (!code) return NextResponse.json({ success: false, error: 'Mã nhóm là bắt buộc.' }, { status: 400 })
    const group = await prisma.group.findUnique({ where: { code }, select: { id: true, name: true } })
    if (!group) return NextResponse.json({ success: false, error: 'Mã nhóm không tồn tại.' }, { status: 404 })
    const membership = await prisma.groupMembership.upsert({
      where: { groupId_userId: { groupId: group.id, userId: user.id } },
      create: { groupId: group.id, userId: user.id, role: 'MEMBER' }, update: {},
    })
    return NextResponse.json({ success: true, group, membership })
  } catch (error) { return errorResponse(error) }
}
