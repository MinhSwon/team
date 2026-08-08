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
      const dbPlaces = await prisma.place.findMany()

      if (dbPlaces.length > 0) {
        // ponytail: neutral legacy defaults; Task 7 removes this route.
        candidatePlaces = dbPlaces.map((p) => ({
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
