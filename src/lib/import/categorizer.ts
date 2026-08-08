export interface CategorizationResult {
  category: string
  subcategory?: string
  tags: string[]
  confidence: number
}

const CATEGORY_RULES: Record<string, { keywords: string[]; subcategories: Record<string, string[]>; tags: Record<string, string[]> }> = {
  Cafe: {
    keywords: ['coffee', 'cafe', 'cà phê', 'espresso', 'roastery', 'tea', 'trà', 'latte', 'workshop', 'matcha'],
    subcategories: {
      'Cafe Chill & Yên Tĩnh': ['chill', 'quiet', 'yên tĩnh', 'làm việc', 'study', 'workplace', 'sách'],
      'Cafe Rooftop & View Đẹp': ['rooftop', 'view', 'tầng', 'sân thượng', 'hoàng hôn', 'skyline'],
      'Coffee & Pastry': ['bánh', 'bakery', 'pastry', 'croissant', 'dessert'],
    },
    tags: {
      'View Đẹp': ['view', 'rooftop', 'sống ảo', 'xinh', 'đẹp', 'hoàng hôn'],
      'Yên Tĩnh': ['quiet', 'yên tĩnh', 'học bài', 'làm việc', 'work'],
      'Sống Ảo': ['decor', 'đẹp', 'checkin', 'instagram', 'concept'],
      'Chill': ['chill', 'thư giãn', 'thoáng', 'sân vườn', 'nhẹ nhàng'],
    },
  },
  Restaurant: {
    keywords: ['quán ăn', 'nhà hàng', 'cơm', 'bún', 'phở', 'lẩu', 'nướng', 'bbq', 'sushi', 'diner', 'bistro', 'bếp', 'món', 'bún bò', 'hải sản'],
    subcategories: {
      'Lẩu & Nướng BBQ': ['lẩu', 'nướng', 'bbq', 'buffet', 'hotpot', 'grill'],
      'Món Việt & Gia Đình': ['cơm', 'bún', 'phở', 'gia đình', 'mâm cơm', 'truyền thống'],
      'Món Nhật & Âu': ['sushi', 'ramen', 'bistro', 'steak', 'pasta', 'món âu', 'pizza'],
    },
    tags: {
      'Đi Nhóm Đông': ['nhóm đông', 'gia đình', 'tiệc', 'rộng', 'buffet', 'lẩu'],
      'Giá Hợp Lý': ['bình dân', 'giá rẻ', 'hợp lý', 'rẻ', 'sinh viên'],
      'Ăn Đêm': ['khuya', 'đêm', '24/7', 'xuyên đêm'],
    },
  },
  Rooftop: {
    keywords: ['rooftop', 'skybar', 'sunset', 'tầng cao', 'sân thượng', 'cocktail', 'pub'],
    subcategories: {
      'Rooftop Lounge & Bar': ['bar', 'cocktail', 'chill', 'music', 'dj', 'lounge'],
      'Cafe Sân Thượng': ['cafe', 'cà phê', 'trà'],
    },
    tags: {
      'Hẹn Hò': ['romantic', 'lãng mạn', 'hẹn hò', 'date', 'view đêm'],
      'View Đẹp': ['skyline', 'view', 'sân thượng', 'hoàng hôn'],
    },
  },
  Entertainment: {
    keywords: ['boardgame', 'karaoke', 'bida', 'billiards', 'cinema', 'rạp phim', 'bowling', 'arcade', 'escape room'],
    subcategories: {
      'Boardgame Hub': ['boardgame', 'thẻ bài', 'ma sói', 'game'],
      'Karaoke & Bida': ['karaoke', 'hát', 'bida', 'billiards', 'pool'],
    },
    tags: {
      'Đi Nhóm Đông': ['nhóm đông', 'bạn bè', 'chơi đông', 'tụ tập'],
      'Vui Nhộn': ['chơi', 'giải trí', 'sôi động', 'vui'],
    },
  },
  Activity: {
    keywords: ['chèo sub', 'workshop', 'gốm', 'vẽ tranh', 'leo núi', 'camping', 'dã ngoại', 'công viên', 'triển lãm', 'art'],
    subcategories: {
      'Art & Craft Workshop': ['gốm', 'vẽ', 'workshop', 'nến', 'làm bánh', 'art'],
      'Dã Ngoại & Thể Thao': ['sub', 'chèo', 'leo núi', 'camping', 'công viên', 'ngoại trời'],
    },
    tags: {
      'Trải Nghiệm Mới': ['khám phá', 'workshop', 'thử thách', 'sáng tạo'],
      'Hoạt Động Nhóm': ['team', 'đồng đội', 'ngoài trời'],
    },
  },
}

export function autoCategorizePlace(name: string, address?: string, notes?: string, rawCategory?: string): CategorizationResult {
  const fullText = `${name} ${address || ''} ${notes || ''} ${rawCategory || ''}`.toLowerCase()

  let matchedCategory = 'Cafe'
  let highestScore = 0
  let matchedSubcategory: string | undefined = undefined
  const extractedTagsSet = new Set<string>()

  // If raw category is given, check direct matches first
  if (rawCategory) {
    const rawLower = rawCategory.toLowerCase()
    if (rawLower.includes('ăn') || rawLower.includes('nhà hàng') || rawLower.includes('food')) {
      matchedCategory = 'Restaurant'
    } else if (rawLower.includes('rooftop') || rawLower.includes('bar')) {
      matchedCategory = 'Rooftop'
    } else if (rawLower.includes('chơi') || rawLower.includes('game') || rawLower.includes('giải trí')) {
      matchedCategory = 'Entertainment'
    } else if (rawLower.includes('hoạt động') || rawLower.includes('workshop')) {
      matchedCategory = 'Activity'
    }
  }

  // Iterate category rules
  for (const [catName, rule] of Object.entries(CATEGORY_RULES)) {
    let score = 0
    rule.keywords.forEach((kw) => {
      if (fullText.includes(kw)) score += 2
    })

    if (score > highestScore) {
      highestScore = score
      matchedCategory = catName

      // Check subcategories
      for (const [subName, subKeywords] of Object.entries(rule.subcategories)) {
        if (subKeywords.some((kw) => fullText.includes(kw))) {
          matchedSubcategory = subName
          break
        }
      }

      // Extract tags
      for (const [tagName, tagKeywords] of Object.entries(rule.tags)) {
        if (tagKeywords.some((kw) => fullText.includes(kw))) {
          extractedTagsSet.add(tagName)
        }
      }
    }
  }

  // Fallback defaults if no specific tags extracted
  if (extractedTagsSet.size === 0) {
    if (matchedCategory === 'Cafe') extractedTagsSet.add('Chill').add('Sống Ảo')
    if (matchedCategory === 'Restaurant') extractedTagsSet.add('Đi Nhóm Đông').add('Giá Hợp Lý')
    if (matchedCategory === 'Rooftop') extractedTagsSet.add('View Đẹp').add('Hẹn Hò')
    if (matchedCategory === 'Entertainment') extractedTagsSet.add('Đi Nhóm Đông').add('Vui Nhộn')
    if (matchedCategory === 'Activity') extractedTagsSet.add('Trải Nghiệm Mới')
  }

  const confidence = Math.min(0.95, 0.75 + highestScore * 0.05)

  return {
    category: matchedCategory,
    subcategory: matchedSubcategory,
    tags: Array.from(extractedTagsSet),
    confidence: Number(confidence.toFixed(2)),
  }
}
