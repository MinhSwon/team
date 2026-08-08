export interface RecommendationInput {
  who: 'JUST_ME' | 'GROUP'
  activity: 'EAT' | 'CAFE' | 'CHILL' | 'ENTERTAINMENT' | 'ACTIVITY' | 'DATE'
  time: 'NOW' | 'TONIGHT' | 'TOMORROW' | 'WEEKEND'
  budget: 'UNDER_100K' | '100_300K' | '300_500K' | '500K_PLUS'
  distance: '1KM' | '3KM' | '5KM' | '10KM'
  userLat?: number
  userLng?: number
}

export interface RecommendedPlaceResult {
  id: string
  name: string
  address: string
  area: string
  category: string
  subcategory?: string
  priceRange: string
  rating: number
  distanceKm: number
  matchScore: number // 0 - 100
  reasons: string[]
  images: string[]
  isOpenNow: boolean
  groupWantToGoCount: number
  savedByCount: number
}

export interface PlaceRawData {
  id: string
  name: string
  address: string
  area: string
  latitude: number
  longitude: number
  categoryName: string
  subcategoryName?: string
  priceRange: string
  rating: number
  images: string[]
  isOpenNow: boolean
  groupWantToGoCount: number
  savedByCount: number
  isVisitedByGroup: boolean
}

export function calculateHaversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371 // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return Number((R * c).toFixed(1))
}

const MAX_DISTANCE_KM: Record<string, number> = {
  '1KM': 1.0,
  '3KM': 3.0,
  '5KM': 5.0,
  '10KM': 10.0,
}

export function runRecommendationEngine(input: RecommendationInput, candidates: PlaceRawData[]): RecommendedPlaceResult[] {
  const targetLat = input.userLat ?? 10.7769 // Default HCM city center (Q1)
  const targetLng = input.userLng ?? 106.7009
  const maxDistance = MAX_DISTANCE_KM[input.distance] || 5.0

  const results: RecommendedPlaceResult[] = []

  for (const place of candidates) {
    // 1. HARD FILTERS
    const dist = calculateHaversineDistance(targetLat, targetLng, place.latitude, place.longitude)
    if (dist > maxDistance && input.distance !== '10KM') continue

    // If time = NOW and place is explicitly closed, hard filter out
    if (input.time === 'NOW' && place.isOpenNow === false) continue

    // 2. FEATURE SCORING (0 to 100)
    let preferenceScore = 70
    let groupInteractionScore = Math.min(100, place.groupWantToGoCount * 25 + place.savedByCount * 15)
    let distanceScore = Math.max(0, 100 - (dist / maxDistance) * 60)
    let budgetScore = place.priceRange === formatBudgetLabel(input.budget) ? 100 : 75
    let availabilityScore = place.isOpenNow ? 100 : 60
    let noveltyScore = place.isVisitedByGroup ? 50 : 95

    // Activity matching boost
    if (isActivityMatch(input.activity, place.categoryName, place.subcategoryName)) {
      preferenceScore += 25
    }

    // Weighted Formula
    let finalScore =
      preferenceScore * 0.3 +
      groupInteractionScore * 0.2 +
      distanceScore * 0.15 +
      budgetScore * 0.15 +
      availabilityScore * 0.1 +
      noveltyScore * 0.1

    finalScore = Math.min(99, Math.max(65, Math.round(finalScore)))

    // 3. EXPLANATION GENERATOR
    const reasons: string[] = []
    if (place.groupWantToGoCount > 0) {
      reasons.push(`${place.groupWantToGoCount} thành viên trong nhóm Muốn Đi`)
    }
    if (place.savedByCount > 0) {
      reasons.push(`${place.savedByCount} người bè đã lưu địa điểm này`)
    }
    if (dist <= 2.0) {
      reasons.push(`Cách bạn chỉ ${dist} km`)
    } else {
      reasons.push(`Nằm trong khu vực ${place.area}`)
    }
    if (place.isOpenNow) {
      reasons.push('Đang mở cửa hoạt động')
    }
    if (isActivityMatch(input.activity, place.categoryName, place.subcategoryName)) {
      reasons.push(`Đúng không gian phù hợp cho nhu cầu ${getActivityLabel(input.activity)}`)
    }

    results.push({
      id: place.id,
      name: place.name,
      address: place.address,
      area: place.area,
      category: place.categoryName,
      subcategory: place.subcategoryName,
      priceRange: place.priceRange,
      rating: place.rating,
      distanceKm: dist,
      matchScore: finalScore,
      reasons,
      images: place.images.length > 0 ? place.images : ['https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=800'],
      isOpenNow: place.isOpenNow,
      groupWantToGoCount: place.groupWantToGoCount,
      savedByCount: place.savedByCount,
    })
  }

  // Sort descending by match score
  results.sort((a, b) => b.matchScore - a.matchScore)

  // Return Top 3 - 7
  return results.slice(0, 7)
}

function isActivityMatch(activity: string, category: string, subcategory?: string): boolean {
  const catLower = category.toLowerCase()
  const subLower = (subcategory || '').toLowerCase()

  if (activity === 'CAFE' && (catLower.includes('cafe') || catLower.includes('rooftop'))) return true
  if (activity === 'EAT' && catLower.includes('restaurant')) return true
  if (activity === 'CHILL' && (catLower.includes('rooftop') || subLower.includes('chill'))) return true
  if (activity === 'ENTERTAINMENT' && catLower.includes('entertainment')) return true
  if (activity === 'ACTIVITY' && catLower.includes('activity')) return true
  if (activity === 'DATE' && (catLower.includes('rooftop') || subLower.includes('hẹn hò'))) return true

  return false
}

function formatBudgetLabel(budget: string): string {
  if (budget === 'UNDER_100K') return '<100k'
  if (budget === '100_300K') return '100–300k'
  if (budget === '300_500K') return '300–500k'
  return '500k+'
}

function getActivityLabel(activity: string): string {
  const map: Record<string, string> = {
    EAT: 'Ăn uống',
    CAFE: 'Cà phê',
    CHILL: 'Chill thư giãn',
    ENTERTAINMENT: 'Giải trí & Chơi nhóm',
    ACTIVITY: 'Hoạt động trải nghiệm',
    DATE: 'Hẹn hò lãng mạn',
  }
  return map[activity] || activity
}
