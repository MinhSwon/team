import assert from 'node:assert/strict'
import test from 'node:test'
import { calculateHaversineDistance, runRecommendationEngine } from '../src/lib/recommendation/engine.ts'
import { createSessionToken, verifySessionToken } from '../src/lib/session-token.ts'

test('haversine distance is approximately one degree of longitude', () => {
  const distance = calculateHaversineDistance(0, 0, 0, 1)
  assert.ok(distance > 110 && distance < 112)
})

test('recommendation excludes closed places for NOW and respects distance', () => {
  const candidates = [
    { id: 'open', name: 'Open', address: '', area: '', latitude: 10.777, longitude: 106.701, categoryName: 'Cafe', priceRange: '100_300K', rating: 4.5, images: [], isOpenNow: true, groupWantToGoCount: 2, savedByCount: 3, isVisitedByGroup: false },
    { id: 'closed', name: 'Closed', address: '', area: '', latitude: 10.777, longitude: 106.701, categoryName: 'Cafe', priceRange: '100_300K', rating: 4.5, images: [], isOpenNow: false, groupWantToGoCount: 2, savedByCount: 3, isVisitedByGroup: false },
    { id: 'far', name: 'Far', address: '', area: '', latitude: 10.9, longitude: 106.9, categoryName: 'Cafe', priceRange: '100_300K', rating: 4.5, images: [], isOpenNow: true, groupWantToGoCount: 2, savedByCount: 3, isVisitedByGroup: false },
  ]
  const results = runRecommendationEngine({ who: 'JUST_ME', activity: 'CAFE', time: 'NOW', budget: '100_300K', distance: '1KM', userLat: 10.7769, userLng: 106.7009 }, candidates)
  assert.deepEqual(results.map((place) => place.id), ['open'])
})

test('the >10KM option does not apply a maximum-distance cutoff', () => {
  const results = runRecommendationEngine({ who: 'JUST_ME', activity: 'CAFE', time: 'NOW', budget: '100_300K', distance: '10KM', userLat: 10.7769, userLng: 106.7009 }, [
    { id: 'far', name: 'Far', address: '', area: '', latitude: 11.2, longitude: 107.2, categoryName: 'Cafe', priceRange: '100_300K', rating: 4, images: [], isOpenNow: true, groupWantToGoCount: 0, savedByCount: 0, isVisitedByGroup: false },
  ])
  assert.equal(results[0]?.id, 'far')
})

test('session token verifies and rejects tampering', () => {
  const token = createSessionToken('user-123')
  assert.equal(verifySessionToken(token)?.userId, 'user-123')
  assert.equal(verifySessionToken(`${token}tampered`), null)
})
