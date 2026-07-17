import type { ChallengeProgress, Conversation, Message, Resource, StreakShare, Therapist, User } from './domain.js'

/** Replace with Postgres/Prisma in production. Kept isolated so the HTTP layer stays unchanged. */
export class MemoryStore {
  users: User[] = [
    { id: 'u-alex', name: 'Alex Lane', role: 'USER', onboardingComplete: true, walletCents: 4500 },
    { id: 'u-jordan', name: 'Jordan Miles', role: 'USER', onboardingComplete: true, walletCents: 0 },
    { id: 'p-maya', name: 'Dr. Maya Chen', role: 'PROFESSIONAL', onboardingComplete: true, walletCents: 0 },
    { id: 'p-jules', name: 'Jules Arden', role: 'PROFESSIONAL', onboardingComplete: true, walletCents: 0 },
  ]
  therapists: Therapist[] = [
    { id: 'p-maya', name: 'Dr. Maya Chen', specialties: ['anxiety', 'life transitions', 'burnout'], hourlyRateCents: 10800, acceptingClients: true, verified: true },
    { id: 'p-jules', name: 'Jules Arden', specialties: ['relationships', 'burnout', 'trauma'], hourlyRateCents: 9300, acceptingClients: true, verified: true },
    { id: 'p-amina', name: 'Amina Okafor', specialties: ['identity', 'self-worth', 'anxiety'], hourlyRateCents: 12600, acceptingClients: false, verified: true },
  ]
  conversations: Conversation[] = []
  messages: Message[] = []
  resources: Resource[] = []
  challenges: ChallengeProgress[] = []
  streakShares: StreakShare[] = []

  user(id: string) { return this.users.find(user => user.id === id) }
  therapist(id: string) { return this.therapists.find(therapist => therapist.id === id) }
  userByEmail(email: string) { return this.users.find(user => user.email?.toLowerCase() === email.toLowerCase()) }
  createLocalUser(input: { name: string; email: string; age: number; country: string; passwordHash: string; role: 'USER' | 'PROFESSIONAL' }) {
    const user: User = { id: makeId('user'), ...input, role: input.role, onboardingComplete: true, walletCents: 0 }
    this.users.push(user)
    if (input.role === 'PROFESSIONAL') this.therapists.push({ id: user.id, name: user.name, specialties: [], hourlyRateCents: 0, acceptingClients: false, verified: false })
    return user
  }
  latestStreak(userId: string) { return this.challenges.filter(progress => progress.userId === userId && progress.completed).sort((a, b) => b.date.localeCompare(a.date))[0]?.streak ?? 0 }
}

export const makeId = (prefix: string) => `${prefix}_${crypto.randomUUID()}`
