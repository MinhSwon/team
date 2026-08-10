import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { hashPassword, verifyPassword } from '@/lib/auth'
import { errorResponse, requireUser } from '@/lib/authorization'

export async function PUT(request: Request) {
  try {
    const user = await requireUser(); const body = await request.json(); const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : ''; const newPassword = typeof body.newPassword === 'string' ? body.newPassword : ''
    const record = await prisma.user.findUnique({ where: { id: user.id }, select: { password: true } })
    if (!record || !(await verifyPassword(currentPassword, record.password))) return NextResponse.json({ success: false, error: 'Mật khẩu hiện tại không đúng.' }, { status: 400 })
    if (newPassword.length < 8) return NextResponse.json({ success: false, error: 'Mật khẩu mới phải có ít nhất 8 ký tự.' }, { status: 400 })
    await prisma.user.update({ where: { id: user.id }, data: { password: await hashPassword(newPassword), passwordUpdatedAt: new Date() } })
    return NextResponse.json({ success: true })
  } catch (error) { return errorResponse(error) }
}
