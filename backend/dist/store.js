/** Replace with Postgres/Prisma in production. Kept isolated so the HTTP layer stays unchanged. */
export class MemoryStore {
    users = [
        { id: 'u-alex', name: 'Alex Lane', role: 'USER', walletCents: 4500 },
        { id: 'u-jordan', name: 'Jordan Miles', role: 'USER', walletCents: 0 },
        { id: 'p-maya', name: 'Dr. Maya Chen', role: 'PROFESSIONAL', walletCents: 0 },
        { id: 'p-jules', name: 'Jules Arden', role: 'PROFESSIONAL', walletCents: 0 },
    ];
    therapists = [
        { id: 'p-maya', name: 'Dr. Maya Chen', specialties: ['anxiety', 'life transitions', 'burnout'], hourlyRateCents: 10800, acceptingClients: true, verified: true },
        { id: 'p-jules', name: 'Jules Arden', specialties: ['relationships', 'burnout', 'trauma'], hourlyRateCents: 9300, acceptingClients: true, verified: true },
        { id: 'p-amina', name: 'Amina Okafor', specialties: ['identity', 'self-worth', 'anxiety'], hourlyRateCents: 12600, acceptingClients: false, verified: true },
    ];
    conversations = [];
    messages = [];
    resources = [];
    challenges = [];
    user(id) { return this.users.find(user => user.id === id); }
    therapist(id) { return this.therapists.find(therapist => therapist.id === id); }
}
export const makeId = (prefix) => `${prefix}_${crypto.randomUUID()}`;
