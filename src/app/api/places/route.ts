import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { MockPlace } from '@/lib/mockData'
import { requireUser } from '@/lib/authorization'

export const dynamic = 'force-dynamic'

type PlaceWithRelations = Prisma.PlaceGetPayload<{ include: {
  category: true
  subcategory: true
  tags: { include: { tag: true } }
  images: true
  groupSaved: true
  userSaved: true
} }>

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const category = searchParams.get('category')
  const query = searchParams.get('query')
  const area = searchParams.get('area')

  try {
    const places = await prisma.place.findMany({
      include: {
        category: true,
        subcategory: true,
        tags: { include: { tag: true } },
        images: true,
        groupSaved: true,
        userSaved: true,
      },
    })

    let filtered: MockPlace[] = places.map((p: PlaceWithRelations) => ({
      id: p.id,
      name: p.name,
      address: p.address,
      area: p.area || 'TP. Hồ Chí Minh',
      latitude: p.latitude,
      longitude: p.longitude,
      categoryName: p.category?.name || 'Cafe',
      subcategoryName: p.subcategory?.name || undefined,
      priceRange: p.priceRange || '100–300k',
      rating: p.rating,
      description: p.description || '',
      phone: p.phone || '',
      website: p.website || '',
      images: p.images.map((i) => i.url),
      tags: p.tags.map((t) => t.tag.name),
      isOpenNow: true,
      groupWantToGoCount: p.groupSaved.filter((g) => g.status === 'WANT_TO_GO').length,
      savedByCount: p.userSaved.length + p.groupSaved.length,
      isVisitedByGroup: p.groupSaved.some((g) => g.status === 'VISITED'),
    }))

    if (category && category !== 'ALL') {
      filtered = filtered.filter((p) => p.categoryName.toLowerCase() === category.toLowerCase())
    }
    if (query) {
      const q = query.toLowerCase()
      filtered = filtered.filter((p) =>
        p.name.toLowerCase().includes(q) ||
        p.address.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.tags.some((t) => t.toLowerCase().includes(q))
      )
    }
    if (area && area !== 'ALL') {
      filtered = filtered.filter((p) => p.area.toLowerCase().includes(area.toLowerCase()))
    }

    return NextResponse.json({ success: true, places: filtered })
  } catch (error) {
    console.error('Failed to load places', error)
    return NextResponse.json({ success: false, error: 'Không thể tải dữ liệu địa điểm lúc này.' }, { status: 503 })
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const body = await request.json() as Record<string, unknown>
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const address = typeof body.address === 'string' ? body.address.trim() : ''
    if (!name || !address) {
      return NextResponse.json({ success: false, error: 'Name and address are required' }, { status: 400 })
    }

    const images = Array.isArray(body.images) ? body.images.filter((url): url is string => typeof url === 'string' && url.length > 0) : []
    const placeImages = images.length > 0 ? images : ['https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=800']
    const latitude = typeof body.latitude === 'number' ? body.latitude : 10.7769 + (Math.random() - 0.5) * 0.04
    const longitude = typeof body.longitude === 'number' ? body.longitude : 106.7009 + (Math.random() - 0.5) * 0.04

    const created = await prisma.place.create({
      data: {
        name,
        address,
        area: typeof body.area === 'string' && body.area.trim() ? body.area.trim() : 'Quận 1',
        latitude,
        longitude,
        priceRange: typeof body.priceRange === 'string' ? body.priceRange : '100–300k',
        description: typeof body.description === 'string' ? body.description : '',
        externalSource: 'USER_GENERATED',
        createdById: user.id,
        images: { create: placeImages.map((url) => ({ url })) },
      },
    })
    return NextResponse.json({ success: true, place: created })
  } catch (error: unknown) {
    console.error('Failed to create place', error)
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Không thể tạo địa điểm.' }, { status: 500 })
  }
}
