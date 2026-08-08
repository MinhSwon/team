import { NextResponse } from 'next/server'

export interface MockGroup {
  id: string
  name: string
  description: string
  avatar: string
  code: string
  memberCount: number
  placeCount: number
  members: Array<{ id: string; name: string; avatar: string; role: string }>
}

export const INITIAL_MOCK_GROUPS: MockGroup[] = [
  {
    id: 'g1',
    name: 'Hội Đại Học 🎓',
    description: 'Nhóm bạn thân thời đại học cùng nhau săn quán cafe chill & tụ tập cuối tuần.',
    avatar: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=400',
    code: 'HOU-2026',
    memberCount: 5,
    placeCount: 14,
    members: [
      { id: 'u1', name: 'Minh', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Minh', role: 'OWNER' },
      { id: 'u2', name: 'Lan', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Lan', role: 'ADMIN' },
      { id: 'u3', name: 'Nam', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Nam', role: 'MEMBER' },
      { id: 'u4', name: 'Linh', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Linh', role: 'MEMBER' },
      { id: 'u5', name: 'Hoàng', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Hoang', role: 'MEMBER' },
    ],
  },
  {
    id: 'g2',
    name: 'Team Công Ty Tech 💻',
    description: 'Chuyên địa điểm ăn trưa, cà phê chiều và quẩy tăng 2-3 sau giờ làm.',
    avatar: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=400',
    code: 'TECH-88',
    memberCount: 8,
    placeCount: 22,
    members: [
      { id: 'u1', name: 'Minh', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Minh', role: 'MEMBER' },
      { id: 'u6', name: 'Sơn', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Son', role: 'OWNER' },
      { id: 'u7', name: 'Trang', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Trang', role: 'ADMIN' },
    ],
  },
]

export async function GET() {
  return NextResponse.json({ success: true, groups: INITIAL_MOCK_GROUPS })
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { name, description } = body

    if (!name) {
      return NextResponse.json({ success: false, error: 'Group name is required' }, { status: 400 })
    }

    const newGroup: MockGroup = {
      id: 'g_' + Date.now(),
      name,
      description: description || 'Nhóm khám phá địa điểm mới.',
      avatar: 'https://images.unsplash.com/photo-1511632765486-a01980e01a18?w=400',
      code: 'GRP-' + Math.floor(1000 + Math.random() * 9000),
      memberCount: 1,
      placeCount: 0,
      members: [{ id: 'u1', name: 'Minh (Bạn)', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Minh', role: 'OWNER' }],
    }

    INITIAL_MOCK_GROUPS.unshift(newGroup)
    return NextResponse.json({ success: true, group: newGroup })
  } catch (error: unknown) {
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 })
  }
}
