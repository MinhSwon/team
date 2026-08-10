import { NextResponse } from 'next/server'
import { AuthTokenType } from '@prisma/client'
import { consumeAuthToken } from '@/lib/auth-tokens'
import { prisma } from '@/lib/db'

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token')
  if (!token) return NextResponse.json({ success: false, error: 'Token không hợp lệ.' }, { status: 400 })
  const userId = await consumeAuthToken(token, AuthTokenType.EMAIL_VERIFICATION)
  if (!userId) return NextResponse.json({ success: false, error: 'Token đã hết hạn hoặc đã được sử dụng.' }, { status: 400 })
  await prisma.user.update({ where: { id: userId }, data: { status: 'ACTIVE' } })
  return NextResponse.json({ success: true, message: 'Email đã được xác thực.' })
}
