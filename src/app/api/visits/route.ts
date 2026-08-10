import { NextResponse } from 'next/server'
import { VisitFeedback } from '@prisma/client'
import { prisma } from '@/lib/db'
import { errorResponse, requireGroupMember, requireUser } from '@/lib/authorization'

export async function GET() {
  try { const user = await requireUser(); const visits = await prisma.visit.findMany({ where: { userId: user.id }, include: { place: { include: { images: true, category: true } }, group: true }, orderBy: { visitedAt: 'desc' } }); return NextResponse.json({ success: true, visits }) } catch (error) { return errorResponse(error) }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser(); const body = await request.json(); const placeId = typeof body.placeId === 'string' ? body.placeId : ''; const groupId = typeof body.groupId === 'string' ? body.groupId : null
    if (!placeId) return NextResponse.json({ success: false, error: 'placeId là bắt buộc.' }, { status: 400 })
    if (!await prisma.place.findUnique({ where: { id: placeId }, select: { id: true } })) return NextResponse.json({ success: false, error: 'Place not found.' }, { status: 404 })
    if (groupId) await requireGroupMember(groupId, user.id)
    const feedback = typeof body.feedback === 'string' && Object.values(VisitFeedback).includes(body.feedback) ? body.feedback : VisitFeedback.LOVED_IT
    const visit = await prisma.$transaction(async (tx) => {
      const created = await tx.visit.create({ data: { userId: user.id, placeId, groupId, feedback, note: typeof body.note === 'string' ? body.note.trim() : undefined, photos: body.photos || undefined } })
      await tx.userSavedPlace.upsert({ where: { userId_placeId: { userId: user.id, placeId } }, create: { userId: user.id, placeId, status: 'VISITED' }, update: { status: 'VISITED' } })
      if (groupId) await tx.groupSavedPlace.updateMany({ where: { groupId, placeId }, data: { status: 'VISITED' } })
      return created
    })
    return NextResponse.json({ success: true, visit }, { status: 201 })
  } catch (error) { return errorResponse(error) }
}
