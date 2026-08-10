export interface CategorizationResult {
  category: string
  subcategory?: string
  tags: string[]
  confidence: number
}

const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

const RULES: Array<{ category: string; keywords: string[]; subcategory: string; subKeywords: string[]; tags: string[] }> = [
  { category: 'Restaurant', keywords: ['restaurant', 'nha hang', 'quan an', 'com', 'bun', 'pho', 'lau', 'nuong', 'bbq', 'sushi', 'pizza', 'bistro', 'steak', 'hai san'], subcategory: 'Món ăn & nhà hàng', subKeywords: ['sushi', 'pizza', 'bbq', 'lau', 'nuong', 'steak'], tags: ['Ăn uống', 'Đi nhóm'] },
  { category: 'Rooftop', keywords: ['rooftop', 'skybar', 'cocktail', 'pub', 'bar', 'san thuong', 'sunset'], subcategory: 'Rooftop & Bar', subKeywords: ['bar', 'cocktail', 'skybar'], tags: ['View đẹp', 'Hẹn hò'] },
  { category: 'Entertainment', keywords: ['boardgame', 'karaoke', 'bida', 'billiards', 'cinema', 'rap phim', 'bowling', 'arcade', 'escape room', 'game'], subcategory: 'Giải trí & chơi nhóm', subKeywords: ['boardgame', 'bida', 'karaoke'], tags: ['Đi nhóm', 'Vui nhộn'] },
  { category: 'Activity', keywords: ['workshop', 'gom', 've tranh', 'leo nui', 'camping', 'da ngoai', 'cong vien', 'trien lam', 'art', 'outdoor'], subcategory: 'Hoạt động trải nghiệm', subKeywords: ['workshop', 'art', 'camping'], tags: ['Trải nghiệm mới', 'Hoạt động nhóm'] },
  { category: 'Cafe', keywords: ['coffee', 'cafe', 'ca phe', 'espresso', 'roastery', 'tea', 'tra', 'latte', 'matcha', 'workshop'], subcategory: 'Cafe chill', subKeywords: ['chill', 'quiet', 'yen tinh', 'work', 'study'], tags: ['Chill', 'Work-friendly'] },
]

export function autoCategorizePlace(name: string, address?: string, notes?: string, rawCategory?: string): CategorizationResult {
  const text = normalize(`${name} ${address || ''} ${notes || ''} ${rawCategory || ''}`)
  const raw = normalize(rawCategory || '')
  let best = RULES.find((rule) => raw.includes(normalize(rule.category))) || RULES[RULES.length - 1]
  let bestScore = 0

  for (const rule of RULES) {
    const score = rule.keywords.reduce((total, keyword) => total + (text.includes(keyword) ? 1 : 0), 0)
    if (score > bestScore) {
      best = rule
      bestScore = score
    }
  }

  const subcategory = best.subKeywords.some((keyword) => text.includes(keyword)) ? best.subcategory : undefined
  return { category: best.category, subcategory, tags: best.tags, confidence: Number(Math.min(0.95, 0.7 + bestScore * 0.08).toFixed(2)) }
}
