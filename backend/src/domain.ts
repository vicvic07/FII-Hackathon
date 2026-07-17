export type Role = 'USER' | 'PROFESSIONAL' | 'ADMIN'
export type ConversationKind = 'PEER' | 'PROFESSIONAL'

export type User = { id: string; name: string; email?: string; age?: number; country?: string; passwordHash?: string; role: Role | null; onboardingComplete: boolean; walletCents: number }
export type Therapist = { id: string; name: string; specialties: string[]; hourlyRateCents: number; acceptingClients: boolean; verified: boolean }
export type Conversation = { id: string; kind: ConversationKind; memberIds: string[]; professionalId?: string; startedAt: Date; billedSeconds: number }
export type Message = { id: string; conversationId: string; senderId: string; body: string; createdAt: Date }
export type Resource = { id: string; title: string; body: string; authorId: string; publishedAt: Date }
export type ChallengeProgress = { userId: string; date: string; completed: boolean; streak: number }
