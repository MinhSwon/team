import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { INITIAL_MOCK_PLACES, MockPlace } from '@/lib/mockData'
import { PlaceResolutionError, resolvePlace } from '@/lib/places'
import { PLACE_LIMITS } from '@/lib/validation'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const category = searchParams.get('category')
  const query = searchParams.get('query')
  const area = searchParams.get('area')

  if (query && query.length > PLACE_LIMITS.query) {
    return NextResponse.json({ success: false, error: 'Search query is too long' }, { status: 400 })
  }

  try {
    const places = await prisma.place.findMany()

    // ponytail: neutral legacy defaults; Task 7 removes this route.
    let filtered: MockPlace[] = places.map((p) => ({
      id: p.id,
      name: p.name,
      address: p.address,
      area: p.area || 'TP. Hồ Chí Minh',
      latitude: p.latitude ?? 0,
      longitude: p.longitude ?? 0,
      categoryName: 'Cafe',
      subcategoryName: undefined,
      priceRange: '100–300k',
      rating: 4.5,
      description: '',
      phone: '',
      website: p.website || '',
      images: [],
      tags: [],
      isOpenNow: true,
      groupWantToGoCount: 0,
      savedByCount: 0,
      isVisitedByGroup: false,
    }))

    if (filtered.length === 0) {
      filtered = INITIAL_MOCK_PLACES
    }

    if (category && category !== 'ALL') {
      filtered = filtered.filter((p: MockPlace) => p.categoryName.toLowerCase() === category.toLowerCase())
    }
    if (query) {
      const q = query.toLowerCase()
      filtered = filtered.filter(
        (p: MockPlace) =>
          p.name.toLowerCase().includes(q) ||
          p.address.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          p.tags.some((t: string) => t.toLowerCase().includes(q))
      )
    }
    if (area && area !== 'ALL') {
      filtered = filtered.filter((p: MockPlace) => p.area.toLowerCase().includes(area.toLowerCase()))
    }

    return NextResponse.json({ success: true, places: filtered })
  } catch {
    // Fallback to mock data if database is not synced yet
    let filtered = INITIAL_MOCK_PLACES
    if (category && category !== 'ALL') {
      filtered = filtered.filter((p: MockPlace) => p.categoryName.toLowerCase() === category.toLowerCase())
    }
    if (query) {
      const q = query.toLowerCase()
      filtered = filtered.filter((p: MockPlace) => p.name.toLowerCase().includes(q) || p.address.toLowerCase().includes(q))
    }
    return NextResponse.json({ success: true, places: filtered })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { name, address, area, categoryName, priceRange, description, addedBy, note, images } = body

    if (!name || !address) {
      return NextResponse.json({ success: false, error: 'Name and address are required' }, { status: 400 })
    }

    const placeImages = Array.isArray(images) && images.length > 0 ? images : ['https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=800']

    // Try saving to DB if connected
    try {
      const created = await resolvePlace({
        type: 'manual',
        name,
        address,
        area: area || 'Quận 1',
        latitude: 10.7769 + (Math.random() - 0.5) * 0.04,
        longitude: 106.7009 + (Math.random() - 0.5) * 0.04,
      })
      return NextResponse.json({ success: true, place: created })
    } catch (error) {
      if (error instanceof PlaceResolutionError) {
        return NextResponse.json({ success: false, error: error.message }, { status: error.status })
      }
      const newMockPlace: MockPlace = {
        id: 'p_' + Date.now(),
        name,
        address,
        area: area || 'Quận 1',
        latitude: 10.7769 + (Math.random() - 0.5) * 0.04,
        longitude: 106.7009 + (Math.random() - 0.5) * 0.04,
        categoryName: categoryName || 'Cafe',
        priceRange: priceRange || '100–300k',
        rating: 4.5,
        description: description || '',
        phone: '',
        website: '',
        images: placeImages,
        tags: ['Mới Thêm', 'Thực Tế'],
        isOpenNow: true,
        groupWantToGoCount: 1,
        savedByCount: 1,
        isVisitedByGroup: false,
        addedBy: addedBy || 'Bạn',
        addedNote: note || '',
      }
      INITIAL_MOCK_PLACES.unshift(newMockPlace)
      return NextResponse.json({ success: true, place: newMockPlace })
    }
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: (err as Error).message }, { status: 500 })
  }
}
