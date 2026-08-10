import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { errorResponse, requireGroupMember, requireUser } from '@/lib/authorization'

export async function POST(_request: Request, { params }: { params: Promise<{ groupId: string }> }) {
  try {
    const user = await requireUser(); const { groupId } = await params; const membership = await requireGroupMember(groupId, user.id)
    if (membership.role === 'OWNER') return NextResponse.json({ success: false, error: 'Owner cần chuyển quyền trước khi rời nhóm.' }, { status: 400 })
    await prisma.groupMembership.delete({ where: { groupId_userId: { groupId, userId: user.id } } })
    return NextResponse.json({ success: true })
  } catch (error) { return errorResponse(error) }
}
