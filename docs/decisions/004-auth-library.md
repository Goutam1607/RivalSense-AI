# 004 — Authentication with Better Auth

**Context.** Email + password sign-up/login, optional GitHub OAuth, secure hashing, sessions, CSRF protection and rate
limiting, with Prisma and Next.js 16.

**Options.** Auth.js v5 (credentials provider is discouraged and leaves password hashing/rate limiting to you);
Clerk / Auth0 (hosted, vendor lock-in, harder to explain in an interview); Lucia (deprecated as a library);
**Better Auth** (actively maintained, first-class email/password, Prisma adapter, built-in rate limiting).

**Decision.** Better Auth 1.7 with the Prisma adapter, database sessions in httpOnly cookies (7-day expiry,
5-minute cookie cache), scrypt password hashing, origin-checked CSRF protection, database-backed rate limits
(sign-in 10/min, sign-up 5/min) so limits hold across serverless instances. GitHub OAuth turns on only when
`GITHUB_CLIENT_ID/SECRET` are set; otherwise the button is disabled with an explanation.

**Consequences.** Auth tables live in our schema. A `user.create.after` hook provisions a personal workspace with an
empty market and read-only access to the demo workspace. Authorisation is *not* delegated to the proxy: every data
function re-checks workspace membership.
