import type { NextFunction, Request, Response } from 'express'
import type { Role, User } from './domain.js'
import type { MemoryStore } from './store.js'
import { readSession } from './services/auth.js'

declare global { namespace Express { interface Request { actor?: User } } }

/** Demo auth: send `Authorization: Bearer u-alex`. Replace with verified JWT/OIDC. */
const cookie = (header: string | undefined, name: string) => header?.split(';').map(item => item.trim().split('=')).find(([key]) => key === name)?.slice(1).join('=')
export function requireAuth(store: MemoryStore) {
  return (req: Request, res: Response, next: NextFunction) => {
    const bearerId = req.header('authorization')?.replace(/^Bearer\s+/i, '')
    const id = bearerId ?? readSession(cookie(req.header('cookie'), 'kindred_session'))?.sub
    const actor = id && store.user(id)
    if (!actor) return res.status(401).json({ error: 'UNAUTHENTICATED', message: 'A valid bearer token is required.' })
    req.actor = actor; next()
  }
}

export const requireRole = (...roles: Role[]) => (req: Request, res: Response, next: NextFunction) => {
  if (!req.actor || !req.actor.role || !roles.includes(req.actor.role)) return res.status(403).json({ error: 'FORBIDDEN', message: 'This action requires a different role.' })
  next()
}
