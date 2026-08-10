import { createHmac, timingSafeEqual } from 'node:crypto'

export const SESSION_COOKIE = 'placedecide_session'
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7

type SessionPayload = { userId: string; expiresAt: number }

function getSessionSecret() {
  if (process.env.AUTH_SECRET) return process.env.AUTH_SECRET
  if (process.env.NODE_ENV === 'production') throw new Error('AUTH_SECRET is required in production')
  return 'placedecide-development-secret-change-me'
}

export function createSessionToken(userId: string) {
  const payload: SessionPayload = { userId, expiresAt: Date.now() + SESSION_MAX_AGE * 1000 }
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = createHmac('sha256', getSessionSecret()).update(encoded).digest('base64url')
  return `${encoded}.${signature}`
}

export function verifySessionToken(token?: string | null) {
  if (!token) return null
  const [encoded, signature] = token.split('.')
  if (!encoded || !signature) return null
  const expected = createHmac('sha256', getSessionSecret()).update(encoded).digest('base64url')
  const actualBuffer = Buffer.from(signature); const expectedBuffer = Buffer.from(expected)
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) return null
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString()) as SessionPayload
    return payload.userId && payload.expiresAt > Date.now() ? payload : null
  } catch { return null }
}
