import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { errorResponse, requireUser } from '@/lib/authorization'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    return NextResponse.json({ user: await getCurrentUser() })
  } catch {
    return NextResponse.json({ user: null })
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireUser(); const body = await request.json()
    const data = Object.fromEntries(Object.entries({ name: body.name, avatar: body.avatar, bio: body.bio }).filter(([, value]) => typeof value === 'string'))
    if (typeof data.name === 'string' && data.name.trim().length < 2) return Response.json({ success: false, error: 'Tên phải có ít nhất 2 ký tự.' }, { status: 400 })
    const updated = await prisma.user.update({ where: { id: user.id }, data })
    return Response.json({ success: true, user: { id: updated.id, name: updated.name, email: updated.email, avatar: updated.avatar, bio: updated.bio } })
  } catch (error) { return errorResponse(error) }
}
