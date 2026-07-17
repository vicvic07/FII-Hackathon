import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { STANDARD_PRO_CHAT_RATE_CENTS_PER_HOUR } from './config.js';
import { requireAuth, requireRole } from './middleware.js';
import { matchTherapists } from './services/matching.js';
import { companionReply } from './services/companion.js';
import { chargeProfessionalChat } from './services/billing.js';
import { makeId, MemoryStore } from './store.js';
const app = express();
const store = new MemoryStore();
app.use(cors({ origin: process.env.ALLOWED_ORIGIN?.split(',') ?? true }));
app.use(express.json({ limit: '32kb' }));
app.get('/health', (_, res) => res.json({ status: 'ok' }));
const publicDirectory = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
app.use(express.static(publicDirectory));
app.use(requireAuth(store));
app.get('/v1/me', (req, res) => res.json(req.actor));
app.get('/v1/pricing', (_, res) => res.json({ professionalChatRateCentsPerHour: STANDARD_PRO_CHAT_RATE_CENTS_PER_HOUR, currency: 'USD' }));
app.get('/v1/therapists', (req, res) => res.json(store.therapists.filter(t => !req.query.available || t.acceptingClients).map(t => ({ ...t, hourlyRateCents: STANDARD_PRO_CHAT_RATE_CENTS_PER_HOUR }))));
app.post('/v1/guide/match', (req, res) => {
    const parsed = z.object({ message: z.string().trim().min(3).max(2000) }).safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: 'INVALID_MESSAGE' });
    res.json(matchTherapists(parsed.data.message, store.therapists));
});
app.post('/v1/companion/messages', async (req, res) => {
    const parsed = z.object({ message: z.string().trim().min(1).max(2000), history: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(2000) })).max(8).optional() }).safeParse(req.body);
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
            billing = chargeProfessionalChat({ conversation, payer: req.actor, professional, hourlyRateCents: STANDARD_PRO_CHAT_RATE_CENTS_PER_HOUR, elapsedSeconds: parsed.data.elapsedSeconds ?? conversation.billedSeconds });
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
app.listen(Number(process.env.PORT ?? 4000), () => console.log('Kindred API listening on :4000'));
