import { NextResponse } from 'next/server'
import { PlaceStatus } from '@prisma/client'
import { prisma } from '@/lib/db'
import { errorResponse, requireGroupMember, requireUser } from '@/lib/authorization'

type Context = { params: Promise<{ groupId: string }> }

export async function POST(request: Request, { params }: Context) {
  try {
    const user = await requireUser(); const { groupId } = await params
    await requireGroupMember(groupId, user.id)
    const body = await request.json(); const placeId = typeof body.placeId === 'string' ? body.placeId : ''
    const status = typeof body.status === 'string' && Object.values(PlaceStatus).includes(body.status) ? body.status : PlaceStatus.WANT_TO_GO
    if (!placeId) return NextResponse.json({ success: false, error: 'placeId là bắt buộc.' }, { status: 400 })
    if (!await prisma.place.findUnique({ where: { id: placeId }, select: { id: true } })) return NextResponse.json({ success: false, error: 'Không tìm thấy địa điểm.' }, { status: 404 })
    const saved = await prisma.groupSavedPlace.upsert({ where: { groupId_placeId: { groupId, placeId } }, create: { groupId, placeId, addedById: user.id, status, groupNote: typeof body.note === 'string' ? body.note.trim() : undefined }, update: { status, groupNote: typeof body.note === 'string' ? body.note.trim() : undefined } })
    return NextResponse.json({ success: true, saved })
  } catch (error) { return errorResponse(error) }
}

export async function DELETE(request: Request, { params }: Context) {
  try {
    const user = await requireUser(); const { groupId } = await params
    await requireGroupMember(groupId, user.id)
    const placeId = new URL(request.url).searchParams.get('placeId')
    if (!placeId) return NextResponse.json({ success: false, error: 'placeId là bắt buộc.' }, { status: 400 })
    await prisma.groupSavedPlace.deleteMany({ where: { groupId, placeId } })
    return NextResponse.json({ success: true })
  } catch (error) { return errorResponse(error) }
}
