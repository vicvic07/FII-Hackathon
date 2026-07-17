# Kindred API

Backend stack: **Node.js + TypeScript + Express + Zod**. The application isolates persistence and payment logic so it can move to PostgreSQL/Prisma and Stripe without changing the HTTP contract.

## Run

```powershell
cd backend
npm.cmd install
npm.cmd run dev
```

Use `Authorization: Bearer u-alex` for a demo user, or `Bearer p-maya` for a verified professional. The service runs at `http://localhost:4000`.

Open `http://localhost:4000` in a browser to use the included API playground. It is served by the API itself and lets you test every available workflow.

## API surface

- `POST /v1/guide/match` — safety-aware matching. It does **not** diagnose. Crisis language returns an urgent safety response, and routine messages return verified therapist matches only.
- `POST /v1/conversations` and `POST /v1/conversations/:id/messages` — peer chat is free; professional chat is pay-as-you-go and charges only the user, based on `elapsedSeconds` and each professional’s personal hourly rate. A 402 is returned if the wallet cannot cover the charge.
- `GET/POST /v1/resources` — POST is professional/admin-only.
- `GET /v1/exercises` and `POST /v1/challenges/today/complete` — wellness library and daily streak endpoint.

## Production hardening required

1. Replace `MemoryStore` with PostgreSQL + Prisma; add migrations, indexes, and audit tables.
2. Replace demo bearer IDs with a verified OIDC/JWT provider and RBAC claims.
3. Integrate Stripe PaymentIntents/Customer Balance. Never accept the client’s elapsed time as the billing source—meter sessions server-side or through your chat provider’s webhooks.
4. Use a managed real-time chat provider (Stream, Sendbird, or Twilio Conversations) for delivery, encryption controls, retention, reporting and moderation; keep this API as the authorization and billing authority.
5. For the AI guide, call a moderated LLM after the crisis classifier, force structured output, redact logs, and retain an explicit no-diagnosis system policy. Escalation copy and local crisis contacts should be reviewed by clinicians and counsel for every country served.
