import { NextResponse } from 'next/server'
import { createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE, verifyPassword } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const password = typeof body.password === 'string' ? body.password : ''
    if (!email || !password) return NextResponse.json({ error: 'Vui lòng nhập email và mật khẩu.' }, { status: 400 })

    const user = await prisma.user.findUnique({ where: { email } })
    if (!user || user.status !== 'ACTIVE' || !(await verifyPassword(password, user.password))) {
      return NextResponse.json({ error: 'Email hoặc mật khẩu không đúng.' }, { status: 401 })
    }

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })

    const response = NextResponse.json({ user: { id: user.id, name: user.name, email: user.email, avatar: user.avatar } })
    response.cookies.set(SESSION_COOKIE, createSessionToken(user.id), {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: SESSION_MAX_AGE,
    })
    return response
  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json({ error: 'Không thể đăng nhập. Hãy kiểm tra kết nối cơ sở dữ liệu.' }, { status: 500 })
  }
}
