import { readSession } from './services/auth.js';
/** Demo auth: send `Authorization: Bearer u-alex`. Replace with verified JWT/OIDC. */
const cookie = (header, name) => header?.split(';').map(item => item.trim().split('=')).find(([key]) => key === name)?.slice(1).join('=');
export function requireAuth(store) {
    return (req, res, next) => {
        const bearerId = req.header('authorization')?.replace(/^Bearer\s+/i, '');
        const id = bearerId ?? readSession(cookie(req.header('cookie'), 'kindred_session'))?.sub;
        const actor = id && store.user(id);
        if (!actor)
            return res.status(401).json({ error: 'UNAUTHENTICATED', message: 'A valid bearer token is required.' });
        req.actor = actor;
        next();
    };
}
export const requireRole = (...roles) => (req, res, next) => {
    if (!req.actor || !req.actor.role || !roles.includes(req.actor.role))
        return res.status(403).json({ error: 'FORBIDDEN', message: 'This action requires a different role.' });
    next();
};
