import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { errorResponse, requireGroupMember, requireUser } from '@/lib/authorization'

export async function POST(request: Request) {
  try {
    const user = await requireUser(); const body = await request.json(); const placeId = typeof body.placeId === 'string' ? body.placeId : ''; const type = typeof body.type === 'string' ? body.type.trim() : ''; const groupId = typeof body.groupId === 'string' ? body.groupId : null
    if (!placeId || !type) return NextResponse.json({ success: false, error: 'placeId và type là bắt buộc.' }, { status: 400 })
    if (!await prisma.place.findUnique({ where: { id: placeId }, select: { id: true } })) return NextResponse.json({ success: false, error: 'Place not found.' }, { status: 404 })
    if (groupId) await requireGroupMember(groupId, user.id)
    const interaction = await prisma.interaction.create({ data: { userId: user.id, placeId, groupId, type, content: typeof body.content === 'string' ? body.content.trim() : undefined } })
    return NextResponse.json({ success: true, interaction }, { status: 201 })
  } catch (error) { return errorResponse(error) }
}
