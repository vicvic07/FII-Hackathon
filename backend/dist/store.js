/** Replace with Postgres/Prisma in production. Kept isolated so the HTTP layer stays unchanged. */
export class MemoryStore {
    users = [
        { id: 'u-alex', name: 'Alex Lane', role: 'USER', onboardingComplete: true, walletCents: 4500 },
        { id: 'u-jordan', name: 'Jordan Miles', role: 'USER', onboardingComplete: true, walletCents: 0 },
        { id: 'p-maya', name: 'Dr. Maya Chen', role: 'PROFESSIONAL', onboardingComplete: true, walletCents: 0 },
        { id: 'p-jules', name: 'Jules Arden', role: 'PROFESSIONAL', onboardingComplete: true, walletCents: 0 },
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
    streakShares = [];
    user(id) { return this.users.find(user => user.id === id); }
    therapist(id) { return this.therapists.find(therapist => therapist.id === id); }
    userByEmail(email) { return this.users.find(user => user.email?.toLowerCase() === email.toLowerCase()); }
    createLocalUser(input) {
        const user = { id: makeId('user'), ...input, role: input.role, onboardingComplete: true, walletCents: 0 };
        this.users.push(user);
        if (input.role === 'PROFESSIONAL')
            this.therapists.push({ id: user.id, name: user.name, specialties: [], hourlyRateCents: 0, acceptingClients: false, verified: false });
        return user;
    }
    latestStreak(userId) { return this.challenges.filter(progress => progress.userId === userId && progress.completed).sort((a, b) => b.date.localeCompare(a.date))[0]?.streak ?? 0; }
}
export const makeId = (prefix) => `${prefix}_${crypto.randomUUID()}`;
