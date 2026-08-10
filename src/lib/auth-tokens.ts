import { createHash, randomBytes } from 'node:crypto'
import { AuthTokenType } from '@prisma/client'
import { prisma } from '@/lib/db'

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export async function issueAuthToken(userId: string, type: AuthTokenType, ttlMs: number) {
  const rawToken = randomBytes(32).toString('base64url')
  await prisma.authToken.deleteMany({ where: { userId, type } })
  await prisma.authToken.create({ data: { userId, type, tokenHash: hashToken(rawToken), expiresAt: new Date(Date.now() + ttlMs) } })
  return rawToken
}

export async function consumeAuthToken(rawToken: string, type: AuthTokenType) {
  const token = await prisma.authToken.findUnique({ where: { tokenHash: hashToken(rawToken) } })
  if (!token || token.type !== type || token.usedAt || token.expiresAt <= new Date()) return null
  await prisma.authToken.update({ where: { id: token.id }, data: { usedAt: new Date() } })
  return token.userId
}

export async function sendAuthEmail(to: string, subject: string, html: string) {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.AUTH_EMAIL_FROM
  if (!apiKey || !from) {
    if (process.env.NODE_ENV !== 'production') console.info(`[auth-email dev] ${to}: ${subject} ${html}`)
    return false
  }
  const response = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from, to: [to], subject, html }) })
  if (!response.ok) throw new Error('Không thể gửi email xác thực.')
  return true
}
