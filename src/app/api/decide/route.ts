import { NextResponse } from 'next/server'
import { runRecommendationEngine, RecommendationInput, PlaceRawData } from '@/lib/recommendation/engine'
import { INITIAL_MOCK_PLACES } from '@/lib/mockData'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const body: RecommendationInput = await request.json()

    // Fetch places from DB or mock data fallback
    let candidatePlaces: PlaceRawData[] = INITIAL_MOCK_PLACES.map((p) => ({
      ...p,
      isVisitedByGroup: p.isVisitedByGroup || false,
    }))

    try {
      const dbPlaces = await prisma.place.findMany({
        include: {
          category: true,
          subcategory: true,
          images: true,
          groupSaved: true,
          userSaved: true,
        },
      })

      if (dbPlaces.length > 0) {
        candidatePlaces = dbPlaces.map((p) => ({
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
          images: p.images.map((i: { url: string }) => i.url),
          tags: [],
          isOpenNow: true,
          groupWantToGoCount: p.groupSaved.filter((g: { status: string }) => g.status === 'WANT_TO_GO').length,
          savedByCount: p.userSaved.length + p.groupSaved.length,
          isVisitedByGroup: p.groupSaved.some((g: { status: string }) => g.status === 'VISITED'),
        }))
      }
    } catch {
      // Use INITIAL_MOCK_PLACES
    }

    const recommendations = runRecommendationEngine(body, candidatePlaces)

    return NextResponse.json({
      success: true,
      sessionId: 'rec_' + Date.now(),
      whoContext: body.who,
      activityContext: body.activity,
      results: recommendations,
    })
  } catch (error: unknown) {
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 })
  }
}
