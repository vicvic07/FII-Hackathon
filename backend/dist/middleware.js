/** Demo auth: send `Authorization: Bearer u-alex`. Replace with verified JWT/OIDC. */
export function requireAuth(store) {
    return (req, res, next) => {
        const id = req.header('authorization')?.replace(/^Bearer\s+/i, '');
        const actor = id && store.user(id);
        if (!actor)
            return res.status(401).json({ error: 'UNAUTHENTICATED', message: 'A valid bearer token is required.' });
        req.actor = actor;
        next();
    };
}
export const requireRole = (...roles) => (req, res, next) => {
    if (!req.actor || !roles.includes(req.actor.role))
        return res.status(403).json({ error: 'FORBIDDEN', message: 'This action requires a different role.' });
    next();
};
