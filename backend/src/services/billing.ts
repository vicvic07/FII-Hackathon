import type { Conversation, User } from '../domain.js'

export function chargeProfessionalChat(input: { conversation: Conversation; payer: User; professional: User; hourlyRateCents: number; elapsedSeconds: number }) {
  if (input.conversation.kind !== 'PROFESSIONAL') return { chargedCents: 0, billedSeconds: input.conversation.billedSeconds }
  const newBillableSeconds = Math.max(0, input.elapsedSeconds - input.conversation.billedSeconds)
  const chargeCents = Math.ceil((input.hourlyRateCents * newBillableSeconds) / 3600)
  if (chargeCents > input.payer.walletCents) throw new Error('INSUFFICIENT_FUNDS')
  input.payer.walletCents -= chargeCents
  input.professional.walletCents += chargeCents
  input.conversation.billedSeconds = input.elapsedSeconds
  return { chargedCents: chargeCents, billedSeconds: input.conversation.billedSeconds }
}
