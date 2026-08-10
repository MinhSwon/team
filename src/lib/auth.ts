import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/db'

import { createSessionToken, verifySessionToken, SESSION_COOKIE, SESSION_MAX_AGE } from '@/lib/session-token'

export { createSessionToken, verifySessionToken, SESSION_COOKIE, SESSION_MAX_AGE }

const scrypt = promisify(scryptCallback)

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex')
  const derivedKey = (await scrypt(password, salt, 64)) as Buffer
  return `${salt}:${derivedKey.toString('hex')}`
}

export async function verifyPassword(password: string, storedHash: string) {
  const [salt, keyHex] = storedHash.split(':')
  if (!salt || !keyHex) return false

  const storedKey = Buffer.from(keyHex, 'hex')
  const derivedKey = (await scrypt(password, salt, storedKey.length)) as Buffer
  return storedKey.length === derivedKey.length && timingSafeEqual(storedKey, derivedKey)
}

export async function getCurrentUser() {
  const cookieStore = await cookies()
  const session = verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value)
  if (!session) return null

  return prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, name: true, email: true, avatar: true },
  })
}
