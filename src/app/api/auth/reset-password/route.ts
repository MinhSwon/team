import { NextResponse } from 'next/server'
import { AuthTokenType } from '@prisma/client'
import { consumeAuthToken } from '@/lib/auth-tokens'
import { hashPassword } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function POST(request: Request) {
  try {
    const body = await request.json(); const token = typeof body.token === 'string' ? body.token : ''; const password = typeof body.password === 'string' ? body.password : ''
    if (password.length < 8) return NextResponse.json({ success: false, error: 'Mật khẩu phải có ít nhất 8 ký tự.' }, { status: 400 })
    const userId = await consumeAuthToken(token, AuthTokenType.PASSWORD_RESET)
    if (!userId) return NextResponse.json({ success: false, error: 'Token đã hết hạn hoặc không hợp lệ.' }, { status: 400 })
    await prisma.user.update({ where: { id: userId }, data: { password: await hashPassword(password), passwordUpdatedAt: new Date() } })
    return NextResponse.json({ success: true })
  } catch (error) { console.error(error); return NextResponse.json({ success: false, error: 'Không thể đặt lại mật khẩu.' }, { status: 500 }) }
}
