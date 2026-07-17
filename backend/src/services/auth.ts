import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { SESSION_SECRET } from '../config.js'
import type { User } from '../domain.js'

const scrypt = promisify(scryptCallback)
const encode = (value: string | Buffer) => Buffer.from(value).toString('base64url')
const decode = (value: string) => Buffer.from(value, 'base64url')
type Session = { sub: string; exp: number }

export async function hashPassword(password: string) {
  const salt = randomBytes(16)
  const derivedKey = await scrypt(password, salt, 64) as Buffer
  return `scrypt$${encode(salt)}$${encode(derivedKey)}`
}
export async function verifyPassword(password: string, stored?: string) {
  if (!stored) return false
  const [algorithm, saltText, hashText] = stored.split('$')
  if (algorithm !== 'scrypt' || !saltText || !hashText) return false
  const actual = await scrypt(password, decode(saltText), 64) as Buffer
  const expected = decode(hashText)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}
export function createSession(user: User) {
  if (!SESSION_SECRET) throw new Error('SESSION_NOT_CONFIGURED')
  const payload = encode(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7 } satisfies Session))
  const signature = encode(createHmac('sha256', SESSION_SECRET).update(payload).digest())
  return `${payload}.${signature}`
}
export function readSession(token?: string) {
  if (!token || !SESSION_SECRET) return undefined
  const [payload, signature] = token.split('.')
  if (!payload || !signature) return undefined
  const expected = createHmac('sha256', SESSION_SECRET).update(payload).digest(); const received = decode(signature)
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return undefined
  const data = JSON.parse(decode(payload).toString()) as Session
  return data.exp > Math.floor(Date.now() / 1000) ? data : undefined
}
