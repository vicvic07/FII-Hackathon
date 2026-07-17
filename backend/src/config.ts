export const FIREWORKS_BASE_URL = 'https://api.fireworks.ai/inference/v1'
export const FIREWORKS_MODEL = process.env.FIREWORKS_MODEL ?? 'accounts/fireworks/models/deepseek-v3p1'
export const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID
export const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET
export const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI ?? 'http://localhost:4000/auth/google/callback'
export const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:5500/frontend/'
export const SESSION_SECRET = process.env.SESSION_SECRET
