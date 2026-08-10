import { NextResponse } from 'next/server'
import { AuthTokenType } from '@prisma/client'
import { createSessionToken, hashPassword, SESSION_COOKIE, SESSION_MAX_AGE } from '@/lib/auth'
import { issueAuthToken, sendAuthEmail } from '@/lib/auth-tokens'
import { prisma } from '@/lib/db'

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const password = typeof body.password === 'string' ? body.password : ''

    if (name.length < 2) return NextResponse.json({ error: 'Tên phải có ít nhất 2 ký tự.' }, { status: 400 })
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: 'Email không hợp lệ.' }, { status: 400 })
    if (password.length < 8) return NextResponse.json({ error: 'Mật khẩu phải có ít nhất 8 ký tự.' }, { status: 400 })

    if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) {
      return NextResponse.json({ error: 'Email này đã được đăng ký.' }, { status: 409 })
    }

    const user = await prisma.user.create({
      data: { name, email, password: await hashPassword(password) },
      select: { id: true, name: true, email: true, avatar: true },
    })

    const response = NextResponse.json({ user }, { status: 201 })
    const verificationToken = await issueAuthToken(user.id, AuthTokenType.EMAIL_VERIFICATION, 1000 * 60 * 60 * 24)
    const verifyUrl = `${new URL(request.url).origin}/api/auth/verify?token=${encodeURIComponent(verificationToken)}`
    try {
      await sendAuthEmail(user.email, 'Xác thực email PlaceDecide', `<p>Chào ${user.name},</p><p>Nhấn vào liên kết để xác thực email:</p><p><a href="${verifyUrl}">${verifyUrl}</a></p>`)
    } catch (emailError) {
      // Verification is optional; a mail provider outage must not block signup.
      console.warn('Optional verification email was not sent:', emailError)
    }
    response.cookies.set(SESSION_COOKIE, createSessionToken(user.id), {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: SESSION_MAX_AGE,
    })
    return response
  } catch (error) {
    console.error('Register error:', error)
    return NextResponse.json({ error: 'Không thể đăng ký. Hãy kiểm tra kết nối cơ sở dữ liệu.' }, { status: 500 })
  }
}
