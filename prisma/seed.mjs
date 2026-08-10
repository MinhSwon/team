import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) })

const categories = [
  { name: 'Cafe', slug: 'cafe' },
  { name: 'Restaurant', slug: 'restaurant' },
  { name: 'Rooftop', slug: 'rooftop' },
  { name: 'Entertainment', slug: 'entertainment' },
  { name: 'Activity', slug: 'activity' },
]

const places = [
  {
    key: 'the-workshop-coffee', name: 'The Workshop Coffee', category: 'cafe',
    address: '27 Ngô Đức Kế, Bến Nghé, Quận 1, TP. Hồ Chí Minh', area: 'Quận 1', latitude: 10.7746, longitude: 106.7048,
    priceRange: '100–300k', rating: 4.6, description: 'Quán cà phê specialty trong không gian nhà cổ, phù hợp làm việc và hẹn hò.',
    tags: ['specialty-coffee', 'work-friendly', 'date'], image: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=1200',
  },
  {
    key: 'pizza-4ps-ben-nghe', name: "Pizza 4P's Ben Nghe", category: 'restaurant',
    address: '8 Thủ Khoa Huân, Bến Nghé, Quận 1, TP. Hồ Chí Minh', area: 'Quận 1', latitude: 10.7778, longitude: 106.6987,
    priceRange: '300–500k', rating: 4.7, description: 'Nhà hàng pizza kiểu Nhật nổi tiếng với phô mai tươi và không gian ấm cúng.',
    tags: ['pizza', 'italian', 'date'], image: 'https://images.unsplash.com/photo-1579751626657-72bc17010498?w=1200',
  },
  {
    key: 'chill-skybar', name: 'Chill Skybar', category: 'rooftop',
    address: 'AB Tower, 76A Lê Lai, Bến Thành, Quận 1, TP. Hồ Chí Minh', area: 'Quận 1', latitude: 10.7717, longitude: 106.6953,
    priceRange: '500k+', rating: 4.4, description: 'Rooftop bar nhìn toàn cảnh trung tâm thành phố, phù hợp buổi tối.',
    tags: ['rooftop', 'cocktail', 'city-view'], image: 'https://images.unsplash.com/photo-1519671482749-fd09be7ccebf?w=1200',
  },
  {
    key: 'the-brix', name: 'The Brix', category: 'restaurant',
    address: '26 Trần Ngọc Diện, Thảo Điền, TP. Thủ Đức, TP. Hồ Chí Minh', area: 'Thảo Điền', latitude: 10.8038, longitude: 106.7338,
    priceRange: '300–500k', rating: 4.5, description: 'Nhà hàng sân vườn ven sông với thực đơn Âu hiện đại và hồ bơi xanh mát.',
    tags: ['garden', 'brunch', 'family'], image: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1200',
  },
  {
    key: 'landmark-81', name: 'Landmark 81 SkyView', category: 'entertainment',
    address: 'Vinhomes Central Park, 720A Điện Biên Phủ, Bình Thạnh, TP. Hồ Chí Minh', area: 'Bình Thạnh', latitude: 10.7951, longitude: 106.7218,
    priceRange: '300–500k', rating: 4.6, description: 'Đài quan sát và trải nghiệm ngắm thành phố từ tòa nhà cao nhất Việt Nam.',
    tags: ['view', 'family', 'activity'], image: 'https://images.unsplash.com/photo-1523731407965-2430cd12f5e4?w=1200',
  },
  {
    key: 'tao-dan-park', name: 'Công viên Tao Đàn', category: 'activity',
    address: 'Trương Định, Phường Bến Thành, Quận 1, TP. Hồ Chí Minh', area: 'Quận 1', latitude: 10.7741, longitude: 106.6888,
    priceRange: '<100k', rating: 4.5, description: 'Không gian xanh trung tâm thành phố để đi bộ, tập thể dục và thư giãn.',
    tags: ['outdoor', 'walking', 'free'], image: 'https://images.unsplash.com/photo-1473448912268-2022ce9509d8?w=1200',
  },
  {
    key: 'the-coffee-house-nguyen-hue', name: 'The Coffee House Nguyễn Huệ', category: 'cafe',
    address: '25 Nguyễn Huệ, Bến Nghé, Quận 1, TP. Hồ Chí Minh', area: 'Quận 1', latitude: 10.7756, longitude: 106.7032,
    priceRange: '100–300k', rating: 4.2, description: 'Quán cà phê dễ tiếp cận tại phố đi bộ Nguyễn Huệ, phù hợp gặp bạn bè.',
    tags: ['coffee', 'central', 'work-friendly'], image: 'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=1200',
  },
  {
    key: 'sushi-hokkaido-sachi', name: 'Sushi Hokkaido Sachi', category: 'restaurant',
    address: '180 Pasteur, Bến Nghé, Quận 1, TP. Hồ Chí Minh', area: 'Quận 1', latitude: 10.7791, longitude: 106.6997,
    priceRange: '500k+', rating: 4.5, description: 'Nhà hàng Nhật với sushi và sashimi tươi, phù hợp dịp đặc biệt.',
    tags: ['japanese', 'sushi', 'special-occasion'], image: 'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?w=1200',
  },
]

const openingHours = Array.from({ length: 7 }, (_, dayOfWeek) => ({ dayOfWeek, openTime: '07:00', closeTime: '22:00', isClosed: false }))

try {
  for (const category of categories) await prisma.placeCategory.upsert({ where: { slug: category.slug }, create: category, update: { name: category.name } })
  console.log(`Seeded ${categories.length} categories.`)

  for (const item of places) {
    const category = await prisma.placeCategory.findUnique({ where: { slug: item.category } })
    if (!category) continue
    const existing = await prisma.place.findFirst({ where: { externalSource: 'SEED', externalPlaceId: item.key } })
    const place = existing
      ? await prisma.place.update({ where: { id: existing.id }, data: { name: item.name, description: item.description, address: item.address, area: item.area, latitude: item.latitude, longitude: item.longitude, priceRange: item.priceRange, rating: item.rating, categoryId: category.id } })
      : await prisma.place.create({ data: { name: item.name, description: item.description, address: item.address, area: item.area, latitude: item.latitude, longitude: item.longitude, priceRange: item.priceRange, rating: item.rating, categoryId: category.id, externalSource: 'SEED', externalPlaceId: item.key } })

    await prisma.placeImage.deleteMany({ where: { placeId: place.id } })
    await prisma.placeImage.create({ data: { placeId: place.id, url: item.image, caption: item.name } })
    await prisma.openingHours.deleteMany({ where: { placeId: place.id } })
    await prisma.openingHours.createMany({ data: openingHours.map((hours) => ({ ...hours, placeId: place.id })) })
    for (const tagName of item.tags) {
      const tag = await prisma.placeTag.upsert({ where: { slug: tagName }, create: { name: tagName.replaceAll('-', ' '), slug: tagName }, update: {} })
      await prisma.placeTagMapping.upsert({ where: { placeId_tagId: { placeId: place.id, tagId: tag.id } }, create: { placeId: place.id, tagId: tag.id }, update: {} })
    }
  }
  console.log(`Seeded ${places.length} sample places.`)
} finally {
  await prisma.$disconnect()
  await pool.end()
}
