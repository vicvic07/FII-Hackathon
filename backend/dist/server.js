import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { requireAuth, requireRole } from './middleware.js';
import { matchTherapists } from './services/matching.js';
import { companionReply } from './services/companion.js';
import { chargeProfessionalChat } from './services/billing.js';
import { makeId, MemoryStore } from './store.js';
import { FRONTEND_URL } from './config.js';
import { createSession, googleAuthorizationUrl, googleIdentity, newOAuthTransaction } from './services/auth.js';
const app = express();
const store = new MemoryStore();
app.use(cors({ origin: process.env.ALLOWED_ORIGIN?.split(',') ?? true }));
app.use(express.json({ limit: '32kb' }));
app.get('/health', (_, res) => res.json({ status: 'ok' }));
const publicDirectory = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
app.use(express.static(publicDirectory));
const oauthTransactions = new Map();
const sessionCookie = (res, token) => res.cookie('kindred_session', token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 7 * 24 * 60 * 60 * 1000, path: '/' });
app.get('/auth/google', (_, res) => {
    try {
        const tx = newOAuthTransaction();
        oauthTransactions.set(tx.state, tx);
        res.redirect(googleAuthorizationUrl(tx));
    }
    catch {
        res.status(503).json({ error: 'GOOGLE_OAUTH_NOT_CONFIGURED', message: 'Set Google OAuth configuration in backend/.env.' });
    }
});
app.get('/auth/google/callback', async (req, res) => {
    const code = typeof req.query.code === 'string' ? req.query.code : undefined;
    const state = typeof req.query.state === 'string' ? req.query.state : undefined;
    const tx = state && oauthTransactions.get(state);
    if (!code || !tx || tx.expiresAt < Date.now())
        return res.status(400).send('Invalid or expired sign-in request.');
    oauthTransactions.delete(tx.state);
    try {
        const identity = await googleIdentity(code, tx);
        const user = store.findOrCreateGoogleUser(identity);
        sessionCookie(res, createSession(user));
        res.redirect(`${FRONTEND_URL}?auth=success${user.onboardingComplete ? '' : '&onboarding=required'}`);
    }
    catch {
        res.status(401).send('Google sign-in could not be verified. Please try again.');
    }
});
app.use(requireAuth(store));
app.get('/auth/session', (req, res) => res.json(req.actor));
app.post('/auth/onboarding', (req, res) => {
    const parsed = z.object({ role: z.enum(['USER', 'PROFESSIONAL']) }).safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: 'INVALID_ROLE' });
    const actor = req.actor;
    actor.role = parsed.data.role;
    actor.onboardingComplete = true;
    if (actor.role === 'PROFESSIONAL' && !store.therapist(actor.id))
        store.therapists.push({ id: actor.id, name: actor.name, specialties: [], hourlyRateCents: 0, acceptingClients: false, verified: false });
    res.json(actor);
});
app.post('/auth/logout', (_, res) => { res.clearCookie('kindred_session', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/' }); res.status(204).end(); });
app.get('/v1/me', (req, res) => res.json(req.actor));
app.get('/v1/therapists', (req, res) => res.json(store.therapists.filter(t => !req.query.available || t.acceptingClients)));
app.post('/v1/guide/match', (req, res) => {
    const parsed = z.object({ message: z.string().trim().min(3).max(2000) }).safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: 'INVALID_MESSAGE' });
    res.json(matchTherapists(parsed.data.message, store.therapists));
});
app.post('/v1/companion/messages', async (req, res) => {
    const parsed = z.object({ message: z.string().trim().min(1).max(2000), mood: z.enum(['very_sad', 'sad', 'neutral', 'good', 'very_good']).optional(), history: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(2000) })).max(8).optional() }).safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: 'INVALID_COMPANION_MESSAGE' });
    try {
        res.json(await companionReply({ ...parsed.data, therapists: store.therapists }));
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'AI_UNAVAILABLE';
        if (message === 'AI_NOT_CONFIGURED')
            return res.status(503).json({ error: message, message: 'Set FIREWORKS_API_KEY in backend/.env, then restart the server.' });
        return res.status(502).json({ error: 'AI_UNAVAILABLE', message: 'The companion is temporarily unavailable. You can still browse therapist matches.' });
    }
});
app.post('/v1/conversations', (req, res) => {
    const parsed = z.object({ kind: z.enum(['PEER', 'PROFESSIONAL']), participantId: z.string().min(1) }).safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: 'INVALID_CONVERSATION' });
    const participant = store.user(parsed.data.participantId);
    if (!participant || participant.id === req.actor.id)
        return res.status(400).json({ error: 'INVALID_PARTICIPANT' });
    const kind = parsed.data.kind;
    if (kind === 'PROFESSIONAL' && participant.role !== 'PROFESSIONAL')
        return res.status(400).json({ error: 'PROFESSIONAL_REQUIRED' });
    if (kind === 'PEER' && participant.role !== 'USER')
        return res.status(400).json({ error: 'PEER_REQUIRED' });
    const conversation = { id: makeId('conv'), kind, memberIds: [req.actor.id, participant.id], professionalId: kind === 'PROFESSIONAL' ? participant.id : undefined, startedAt: new Date(), billedSeconds: 0 };
    store.conversations.push(conversation);
    res.status(201).json(conversation);
});
app.get('/v1/conversations/:id/messages', (req, res) => {
    const c = store.conversations.find(x => x.id === req.params.id);
    if (!c || !c.memberIds.includes(req.actor.id))
        return res.status(404).json({ error: 'NOT_FOUND' });
    res.json(store.messages.filter(m => m.conversationId === c.id));
});
app.post('/v1/conversations/:id/messages', (req, res) => {
    const parsed = z.object({ body: z.string().trim().min(1).max(4000), elapsedSeconds: z.number().int().nonnegative().optional() }).safeParse(req.body);
    const conversation = store.conversations.find(x => x.id === req.params.id);
    if (!parsed.success)
        return res.status(400).json({ error: 'INVALID_MESSAGE' });
    if (!conversation || !conversation.memberIds.includes(req.actor.id))
        return res.status(404).json({ error: 'NOT_FOUND' });
    let billing = { chargedCents: 0, billedSeconds: conversation.billedSeconds };
    if (conversation.kind === 'PROFESSIONAL' && req.actor.role === 'USER') {
        const professional = store.user(conversation.professionalId);
        const profile = store.therapist(professional.id);
        try {
            billing = chargeProfessionalChat({ conversation, payer: req.actor, professional, hourlyRateCents: profile.hourlyRateCents, elapsedSeconds: parsed.data.elapsedSeconds ?? conversation.billedSeconds });
        }
        catch {
            return res.status(402).json({ error: 'INSUFFICIENT_FUNDS', message: 'Add funds to continue this professional chat.' });
        }
    }
    const message = { id: makeId('msg'), conversationId: conversation.id, senderId: req.actor.id, body: parsed.data.body, createdAt: new Date() };
    store.messages.push(message);
    res.status(201).json({ message, billing });
});
app.get('/v1/resources', (_, res) => res.json(store.resources));
app.post('/v1/resources', requireRole('PROFESSIONAL', 'ADMIN'), (req, res) => {
    const parsed = z.object({ title: z.string().trim().min(4).max(150), body: z.string().trim().min(50).max(20000) }).safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: 'INVALID_RESOURCE' });
    const resource = { id: makeId('resource'), ...parsed.data, authorId: req.actor.id, publishedAt: new Date() };
    store.resources.push(resource);
    res.status(201).json(resource);
});
app.get('/v1/exercises', (_, res) => res.json([{ id: 'box-breathing', title: 'Box breathing', durationSeconds: 180 }, { id: 'thought-checkin', title: 'Thought check-in', durationSeconds: 300 }, { id: 'body-scan', title: 'Body scan', durationSeconds: 480 }]));
app.post('/v1/challenges/today/complete', (req, res) => {
    const today = new Date().toISOString().slice(0, 10);
    const existing = store.challenges.find(x => x.userId === req.actor.id && x.date === today);
    if (existing)
        return res.json(existing);
    const previous = store.challenges.filter(x => x.userId === req.actor.id && x.completed).sort((a, b) => b.date.localeCompare(a.date))[0];
    const progress = { userId: req.actor.id, date: today, completed: true, streak: (previous?.streak ?? 0) + 1 };
    store.challenges.push(progress);
    res.status(201).json(progress);
});
app.use((_, res) => res.status(404).json({ error: 'NOT_FOUND' }));
function listen(port, label) {
    const server = app.listen(port, () => console.log(`Kindred API listening on :${port} (${label})`));
    server.on('error', error => console.warn(`Could not start ${label} listener on :${port}: ${error.message}`));
}
const port = Number(process.env.PORT ?? 4000);
// The separately served demo site on :5500 currently targets this API origin.
const compatibilityPort = Number(process.env.COMPATIBILITY_PORT ?? 4001);
listen(port, 'primary');
if (compatibilityPort !== port)
    listen(compatibilityPort, 'frontend compatibility');
