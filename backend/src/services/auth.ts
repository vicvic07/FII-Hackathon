import { createHash, createHmac, createPublicKey, randomBytes, timingSafeEqual, verify as verifySignature } from 'node:crypto'
import { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI, SESSION_SECRET } from '../config.js'
import type { User } from '../domain.js'

const encode = (value: string | Buffer) => Buffer.from(value).toString('base64url')
const decode = (value: string) => Buffer.from(value, 'base64url')
type Session = { sub: string; exp: number }

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
  const expected = createHmac('sha256', SESSION_SECRET).update(payload).digest()
  const received = decode(signature)
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return undefined
  const data = JSON.parse(decode(payload).toString()) as Session
  return data.exp > Math.floor(Date.now() / 1000) ? data : undefined
}

export type OAuthTransaction = { state: string; verifier: string; expiresAt: number }
export function newOAuthTransaction(): OAuthTransaction { return { state: encode(randomBytes(32)), verifier: encode(randomBytes(32)), expiresAt: Date.now() + 10 * 60 * 1000 } }
export function googleAuthorizationUrl(tx: OAuthTransaction) {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) throw new Error('GOOGLE_OAUTH_NOT_CONFIGURED')
  const query = new URLSearchParams({ client_id: GOOGLE_CLIENT_ID, redirect_uri: GOOGLE_REDIRECT_URI, response_type: 'code', scope: 'openid email profile', state: tx.state, code_challenge: encode(createHash('sha256').update(tx.verifier).digest()), code_challenge_method: 'S256', prompt: 'select_account' })
  return `https://accounts.google.com/o/oauth2/v2/auth?${query}`
}
export async function googleIdentity(code: string, tx: OAuthTransaction) {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) throw new Error('GOOGLE_OAUTH_NOT_CONFIGURED')
  const body = new URLSearchParams({ code, client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET, redirect_uri: GOOGLE_REDIRECT_URI, grant_type: 'authorization_code', code_verifier: tx.verifier })
  const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body })
  if (!response.ok) throw new Error('GOOGLE_TOKEN_EXCHANGE_FAILED')
  const tokens = await response.json() as { id_token?: string }
  if (!tokens.id_token) throw new Error('GOOGLE_ID_TOKEN_MISSING')
  const [headerPart, payloadPart, signaturePart] = tokens.id_token.split('.')
  if (!headerPart || !payloadPart || !signaturePart) throw new Error('GOOGLE_ID_TOKEN_INVALID')
  const header = JSON.parse(decode(headerPart).toString()) as { kid?: string; alg?: string }
  const claims = JSON.parse(decode(payloadPart).toString()) as { sub?: string; email?: string; email_verified?: boolean; name?: string; aud?: string | string[]; iss?: string; exp?: number }
  const keysResponse = await fetch('https://www.googleapis.com/oauth2/v3/certs')
  const keys = await keysResponse.json() as { keys: Array<{ kid?: string; kty: string; n: string; e: string }> }
  const jwk = keys.keys.find(key => key.kid === header.kid)
  const verified = jwk && header.alg === 'RS256' && verifySignature('RSA-SHA256', Buffer.from(`${headerPart}.${payloadPart}`), createPublicKey({ key: jwk, format: 'jwk' }), decode(signaturePart))
  const audience = Array.isArray(claims.aud) ? claims.aud.includes(GOOGLE_CLIENT_ID) : claims.aud === GOOGLE_CLIENT_ID
  if (!verified || !audience || !['https://accounts.google.com', 'accounts.google.com'].includes(claims.iss ?? '') || !claims.exp || claims.exp <= Date.now() / 1000 || !claims.sub || !claims.email || claims.email_verified !== true) throw new Error('GOOGLE_ID_TOKEN_INVALID')
  return { subject: claims.sub, email: claims.email, name: claims.name ?? claims.email }
}
