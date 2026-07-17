import type { NextFunction, Request, Response } from 'express'
import type { Role, User } from './domain.js'
import type { MemoryStore } from './store.js'

declare global { namespace Express { interface Request { actor?: User } } }

/** Demo auth: send `Authorization: Bearer u-alex`. Replace with verified JWT/OIDC. */
export function requireAuth(store: MemoryStore) {
  return (req: Request, res: Response, next: NextFunction) => {
    const id = req.header('authorization')?.replace(/^Bearer\s+/i, '')
    const actor = id && store.user(id)
    if (!actor) return res.status(401).json({ error: 'UNAUTHENTICATED', message: 'A valid bearer token is required.' })
    req.actor = actor; next()
  }
}

export const requireRole = (...roles: Role[]) => (req: Request, res: Response, next: NextFunction) => {
  if (!req.actor || !roles.includes(req.actor.role)) return res.status(403).json({ error: 'FORBIDDEN', message: 'This action requires a different role.' })
  next()
}
