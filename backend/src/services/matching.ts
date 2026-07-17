import type { Therapist } from '../domain.js'

const emergency = /suicid|kill myself|self[- ]?harm|hurt myself|end my life/i
const clinicalClaim = /do i have|diagnose|diagnosis|am i bipolar|do i have depression/i
const topicMap: Record<string, string[]> = {
  anxiety: ['anxiety', 'panic', 'worry', 'overthink', 'stress'],
  burnout: ['burnout', 'work', 'exhausted', 'tired'],
  relationships: ['relationship', 'partner', 'family', 'breakup'],
  identity: ['identity', 'belong', 'self-worth', 'confidence'],
  trauma: ['trauma', 'abuse', 'flashback'],
}

export type GuideResult = { safety: 'ROUTINE' | 'URGENT'; message: string; suggestedSpecialties: string[]; matches: Therapist[] }

/** Guardrailed matching only: no diagnosis, treatment plan, or clinical conclusion. */
export function matchTherapists(message: string, therapists: Therapist[]): GuideResult {
  if (emergency.test(message)) return { safety: 'URGENT', suggestedSpecialties: [], matches: [], message: 'I’m really glad you said something. I can’t provide crisis support. If you may be in immediate danger, contact your local emergency number now. In the U.S. or Canada, call or text 988; elsewhere, contact your local crisis service or someone you trust.' }
  const input = message.toLowerCase()
  const specialties = Object.entries(topicMap).filter(([, words]) => words.some(word => input.includes(word))).map(([specialty]) => specialty)
  const ranked = therapists.filter(t => t.verified && t.acceptingClients).map(t => ({ therapist: t, score: t.specialties.filter(s => specialties.includes(s)).length })).sort((a,b) => b.score - a.score).slice(0, 3).map(x => x.therapist)
  const nonDiagnostic = clinicalClaim.test(message) ? 'I can’t diagnose or tell you whether you have a condition. ' : ''
  return { safety: 'ROUTINE', suggestedSpecialties: specialties, matches: ranked, message: `${nonDiagnostic}I can help you find a verified professional whose experience may fit what you shared.` }
}
