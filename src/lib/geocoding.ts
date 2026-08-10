export async function geocodeAddress(address: string) {
  const query = address.trim()
  if (!query) return null
  const normalized = query
    .replace(/\bq\.?\s*9\b/gi, 'Thủ Đức')
    .replace(/\bquận\s*9\b/gi, 'Thủ Đức')
    .replace(/\bq\.?\s*2\b/gi, 'Thủ Đức')
    .replace(/\bquận\s*2\b/gi, 'Thủ Đức')
    .replace(/\bquận\s*thủ\s*đức\b/gi, 'Thủ Đức')
  const withoutHouseNumber = query.replace(/^\s*\d+[a-zA-Z]?\s+/, '')
  const normalizedWithoutHouseNumber = normalized.replace(/^\s*\d+[a-zA-Z]?\s+/, '')
  const candidates = [...new Set([query, normalized, withoutHouseNumber, normalizedWithoutHouseNumber])].filter(Boolean)
  try {
    for (const candidate of candidates) {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=vn&q=${encodeURIComponent(candidate)}`, { headers: { 'User-Agent': 'PlaceDecide/1.0 (local development)' }, signal: AbortSignal.timeout(5000) })
      if (!response.ok) continue
      const result = (await response.json()) as Array<{ lat: string; lon: string; display_name?: string }>
      if (result[0]) return { latitude: Number(result[0].lat), longitude: Number(result[0].lon), displayName: result[0].display_name || candidate }
    }
    return null
  } catch { return null }
}
