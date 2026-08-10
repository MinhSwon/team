import { NextResponse } from 'next/server'
import { AuthTokenType } from '@prisma/client'
import { prisma } from '@/lib/db'
import { issueAuthToken, sendAuthEmail } from '@/lib/auth-tokens'

export async function POST(request: Request) {
  try {
    const body = await request.json(); const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true, name: true, email: true } })
    if (user) {
      const token = await issueAuthToken(user.id, AuthTokenType.PASSWORD_RESET, 1000 * 60 * 30)
      const resetUrl = `${new URL(request.url).origin}/reset-password?token=${encodeURIComponent(token)}`
      await sendAuthEmail(user.email, 'Đặt lại mật khẩu PlaceDecide', `<p>Chào ${user.name},</p><p>Liên kết đặt lại mật khẩu có hiệu lực trong 30 phút:</p><p><a href="${resetUrl}">${resetUrl}</a></p>`)
    }
    return NextResponse.json({ success: true, message: 'Nếu email tồn tại, hướng dẫn đặt lại mật khẩu đã được gửi.' })
  } catch (error) { console.error(error); return NextResponse.json({ success: false, error: 'Không thể xử lý yêu cầu.' }, { status: 500 }) }
}
