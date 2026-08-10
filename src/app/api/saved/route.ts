import { NextResponse } from 'next/server'
import { PlaceStatus } from '@prisma/client'
import { prisma } from '@/lib/db'
import { errorResponse, requireUser } from '@/lib/authorization'

export async function GET(request: Request) {
  try {
    const user = await requireUser()
    const rawStatus = new URL(request.url).searchParams.get('status')
    const status = rawStatus && Object.values(PlaceStatus).includes(rawStatus as PlaceStatus) ? rawStatus as PlaceStatus : undefined
    const saved = await prisma.userSavedPlace.findMany({
      where: { userId: user.id, ...(status ? { status } : {}) },
      include: { place: { include: { category: true, subcategory: true, images: true, tags: { include: { tag: true } } } } },
      orderBy: { savedAt: 'desc' },
    })
    return NextResponse.json({ success: true, saved })
  } catch (error) { return errorResponse(error) }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const body = await request.json()
    const placeId = typeof body.placeId === 'string' ? body.placeId : ''
    const status = typeof body.status === 'string' && Object.values(PlaceStatus).includes(body.status) ? body.status : PlaceStatus.WANT_TO_GO
    if (!placeId) return NextResponse.json({ success: false, error: 'placeId là bắt buộc.' }, { status: 400 })
    if (!await prisma.place.findUnique({ where: { id: placeId }, select: { id: true } })) return NextResponse.json({ success: false, error: 'Không tìm thấy địa điểm.' }, { status: 404 })
    const saved = await prisma.userSavedPlace.upsert({
      where: { userId_placeId: { userId: user.id, placeId } },
      create: { userId: user.id, placeId, status, note: typeof body.note === 'string' ? body.note.trim() : undefined },
      update: { status, note: typeof body.note === 'string' ? body.note.trim() : undefined },
    })
    return NextResponse.json({ success: true, saved })
  } catch (error) { return errorResponse(error) }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireUser()
    const placeId = new URL(request.url).searchParams.get('placeId')
    if (!placeId) return NextResponse.json({ success: false, error: 'placeId là bắt buộc.' }, { status: 400 })
    await prisma.userSavedPlace.deleteMany({ where: { userId: user.id, placeId } })
    return NextResponse.json({ success: true })
  } catch (error) { return errorResponse(error) }
}
