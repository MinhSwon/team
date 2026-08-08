export interface MockPlace {
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
  description: string
  phone: string
  website: string
  images: string[]
  tags: string[]
  isOpenNow: boolean
  groupWantToGoCount: number
  savedByCount: number
  isVisitedByGroup: boolean
  addedBy?: string
  addedNote?: string
}

export const INITIAL_MOCK_PLACES: MockPlace[] = [
  {
    id: 'p1',
    name: 'The Workshop Coffee',
    address: '27 Ngô Đức Kế, Phường Bến Nghé, Quận 1',
    area: 'Quận 1',
    latitude: 10.7758,
    longitude: 106.7042,
    categoryName: 'Cafe',
    subcategoryName: 'Cafe Chill & Yên Tĩnh',
    priceRange: '100–300k',
    rating: 4.8,
    description: 'Không gian cà phê specialty đầu tiên tại Sài Gòn với kiến trúc công nghiệp ấn tượng, phù hợp làm việc và chill.',
    phone: '028 3824 6801',
    website: 'https://theworkshopcoffee.com',
    images: ['https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=800', 'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=800'],
    tags: ['Yên Tĩnh', 'View Đẹp', 'Chill', 'Học Bài'],
    isOpenNow: true,
    groupWantToGoCount: 4,
    savedByCount: 8,
    isVisitedByGroup: false,
    addedBy: 'Minh',
    addedNote: 'Quán làm việc view ngắm đường phố cực phê, cuối tuần đi thử nha!',
  },
  {
    id: 'p2',
    name: 'Zion Sky Lounge & Dining',
    address: '87 Nguyễn Trãi, Phường Bến Thành, Quận 1',
    area: 'Quận 1',
    latitude: 10.7712,
    longitude: 106.6948,
    categoryName: 'Rooftop',
    subcategoryName: 'Rooftop Lounge & Bar',
    priceRange: '300–500k',
    rating: 4.7,
    description: 'Rooftop sang trọng ngắm toàn cảnh tháp Bitexco và Sài Gòn về đêm với nhạc chill và cocktail tinh tế.',
    phone: '093 838 8787',
    website: 'https://zionlounge.vn',
    images: ['https://images.unsplash.com/photo-1572116469696-31de0f17cc34?w=800', 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800'],
    tags: ['View Đẹp', 'Hẹn Hò', 'Sang Trọng', 'Mở Đêm'],
    isOpenNow: true,
    groupWantToGoCount: 5,
    savedByCount: 12,
    isVisitedByGroup: false,
    addedBy: 'Lan',
    addedNote: 'View đêm cực sang ngắm trọn quận 1, hợp đi nhóm quẩy nhẹ hoặc date.',
  },
  {
    id: 'p3',
    name: 'Quán Nướng Cô Điệp - BBQ Hàn Quốc',
    address: '142 Phan Xích Long, Phường 2, Phú Nhuận',
    area: 'Phú Nhuận',
    latitude: 10.7963,
    longitude: 106.6892,
    categoryName: 'Restaurant',
    subcategoryName: 'Lẩu & Nướng BBQ',
    priceRange: '100–300k',
    rating: 4.6,
    description: 'Quán nướng than hoa chuẩn vị Hàn Quốc, thịt ướp đậm đà, panchan ăn kèm thả ga, bàn rộng cho nhóm.',
    phone: '090 912 3456',
    website: '',
    images: ['https://images.unsplash.com/photo-1544025162-d76694265947?w=800', 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=800'],
    tags: ['Đi Nhóm Đông', 'Giá Hợp Lý', 'Nướng BBQ'],
    isOpenNow: true,
    groupWantToGoCount: 3,
    savedByCount: 6,
    isVisitedByGroup: true,
    addedBy: 'Nam',
    addedNote: 'Nướng ngon rẻ, combo cho nhóm 4 người siêu hời.',
  },
  {
    id: 'p4',
    name: 'Boardgame Station Saigon',
    address: '30 Trần Cao Vân, Phường 6, Quận 3',
    area: 'Quận 3',
    latitude: 10.7831,
    longitude: 106.6974,
    categoryName: 'Entertainment',
    subcategoryName: 'Boardgame Hub',
    priceRange: '<100k',
    rating: 4.9,
    description: 'Hơn 200+ bộ boardgame đa dạng từ nhập môn đến hardcore, có Game Master hướng dẫn tận tình.',
    phone: '098 765 4321',
    website: 'https://boardgamestation.vn',
    images: ['https://images.unsplash.com/photo-1610890716171-6b1bb98ffd09?w=800', 'https://images.unsplash.com/photo-1563941402622-4e7a488bcc57?w=800'],
    tags: ['Đi Nhóm Đông', 'Vui Nhộn', 'Giá Rẻ', 'Game Master'],
    isOpenNow: true,
    groupWantToGoCount: 6,
    savedByCount: 15,
    isVisitedByGroup: false,
    addedBy: 'Linh',
    addedNote: 'Cuối tuần đi chơi Ma Sói hoặc Catan ở đây bao vui!',
  },
  {
    id: 'p5',
    name: 'Chèo SUB Bán Đảo Thanh Đa',
    address: '450/19 Bình Quới, Phường 28, Bình Thạnh',
    area: 'Bình Thạnh',
    latitude: 10.8251,
    longitude: 106.7291,
    categoryName: 'Activity',
    subcategoryName: 'Dã Ngoại & Thể Thao',
    priceRange: '100–300k',
    rating: 4.8,
    description: 'Trải nghiệm chèo ván SUB trên sông Sài Gòn đón hoàng hôn, không khí trong lành mát mẻ.',
    phone: '091 234 5678',
    website: 'https://subsaigon.com',
    images: ['https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=800', 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800'],
    tags: ['Trải Nghiệm Mới', 'Hoạt Động Nhóm', 'Ngoài Trời', 'Hoàng Hôn'],
    isOpenNow: false,
    groupWantToGoCount: 2,
    savedByCount: 5,
    isVisitedByGroup: false,
    addedBy: 'Hội Đại học',
    addedNote: 'Đổi gió đi chèo SUB ngắm hoàng hôn thứ 7 tuần này.',
  },
]
