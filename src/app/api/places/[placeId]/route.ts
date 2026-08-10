import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { errorResponse, requireUser } from '@/lib/authorization'

type Context = { params: Promise<{ placeId: string }> }

export async function GET(_request: Request, { params }: Context) {
  try {
    const { placeId } = await params
    const place = await prisma.place.findUnique({ where: { id: placeId }, include: {
      category: true, subcategory: true, tags: { include: { tag: true } }, images: true, openingHours: true,
      userSaved: { include: { user: { select: { id: true, name: true, avatar: true } } }, orderBy: { savedAt: 'desc' } },
      groupSaved: { include: { group: { select: { id: true, name: true } } }, orderBy: { savedAt: 'desc' } },
      visits: { include: { user: { select: { id: true, name: true, avatar: true } } }, orderBy: { visitedAt: 'desc' } },
      interactions: { include: { user: { select: { id: true, name: true, avatar: true } } }, orderBy: { createdAt: 'desc' } },
    } })
    if (!place) return NextResponse.json({ success: false, error: 'Không tìm thấy địa điểm.' }, { status: 404 })
    return NextResponse.json({ success: true, place })
  } catch (error) { return errorResponse(error) }
}

export async function PATCH(request: Request, { params }: Context) {
  try {
    const user = await requireUser(); const { placeId } = await params
    const existing = await prisma.place.findUnique({ where: { id: placeId }, select: { id: true, createdById: true } })
    if (!existing) return NextResponse.json({ success: false, error: 'Không tìm thấy địa điểm.' }, { status: 404 })
    if (existing.createdById && existing.createdById !== user.id) return NextResponse.json({ success: false, error: 'Bạn không có quyền sửa địa điểm này.' }, { status: 403 })
    const body = await request.json()
    const data = Object.fromEntries(Object.entries({ name: body.name, description: body.description, address: body.address, area: body.area, phone: body.phone, website: body.website, priceRange: body.priceRange }).filter(([, value]) => typeof value === 'string'))
    if (Object.keys(data).length === 0) return NextResponse.json({ success: false, error: 'Không có dữ liệu cập nhật.' }, { status: 400 })
    const place = await prisma.place.update({ where: { id: placeId }, data })
    return NextResponse.json({ success: true, place })
  } catch (error) { return errorResponse(error) }
}

export async function DELETE(_request: Request, { params }: Context) {
  try {
    const user = await requireUser(); const { placeId } = await params
    const existing = await prisma.place.findUnique({ where: { id: placeId }, select: { createdById: true } })
    if (!existing) return NextResponse.json({ success: false, error: 'Không tìm thấy địa điểm.' }, { status: 404 })
    if (existing.createdById && existing.createdById !== user.id) return NextResponse.json({ success: false, error: 'Bạn không có quyền xóa địa điểm này.' }, { status: 403 })
    await prisma.place.delete({ where: { id: placeId } })
    return NextResponse.json({ success: true })
  } catch (error) { return errorResponse(error) }
}
