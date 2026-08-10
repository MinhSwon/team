import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { runRecommendationEngine, RecommendationInput, PlaceRawData } from '@/lib/recommendation/engine'
import { prisma } from '@/lib/db'
import { errorResponse, requireUser } from '@/lib/authorization'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const rawBody = await request.json() as Partial<RecommendationInput> & { groupId?: unknown }
    const body: RecommendationInput = {
      who: rawBody.who as RecommendationInput['who'],
      activity: rawBody.activity as RecommendationInput['activity'],
      time: rawBody.time as RecommendationInput['time'],
      budget: rawBody.budget as RecommendationInput['budget'],
      distance: rawBody.distance as RecommendationInput['distance'],
      ...(Number.isFinite(rawBody.userLat) ? { userLat: Number(rawBody.userLat) } : {}),
      ...(Number.isFinite(rawBody.userLng) ? { userLng: Number(rawBody.userLng) } : {}),
    }

    const dbPlaces = await prisma.place.findMany({
      include: {
        category: true,
        subcategory: true,
        images: true,
        groupSaved: true,
        userSaved: true,
      },
    })

    const candidatePlaces: PlaceRawData[] = dbPlaces.map((p) => ({
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
          tags: [],
          isOpenNow: true,
          groupWantToGoCount: p.groupSaved.filter((g) => g.status === 'WANT_TO_GO').length,
          savedByCount: p.userSaved.length + p.groupSaved.length,
          isVisitedByGroup: p.groupSaved.some((g) => g.status === 'VISITED'),
        }))

    const recommendations = runRecommendationEngine(body, candidatePlaces)

    const groupId = typeof rawBody.groupId === 'string' ? rawBody.groupId : null
    const session = await prisma.recommendationSession.create({ data: { userId: user.id, groupId, whoContext: body.who, activityContext: body.activity, timeContext: body.time, budgetContext: body.budget, distanceContext: body.distance, results: recommendations as unknown as Prisma.InputJsonValue } })

    return NextResponse.json({
      success: true,
      sessionId: session.id,
      whoContext: body.who,
      activityContext: body.activity,
      results: recommendations,
    })
  } catch (error: unknown) { return errorResponse(error) }
}
