# Girin Study

Deployment wrapper for the Girin Study site.

The application source is reconstructed from `.source/chunk-*.b64` during the build. Existing patches apply first, followed by `.patches/admin.patch` and `admin-overrides/`. The original public URLs are preserved.

Deployment target: Vercel Next.js.
Deployment installer: npm.

## Administrator access

Only the `admin` account can open the application or call its data APIs. Login uses a server-side scrypt password verifier and an encrypted HttpOnly cookie with an eight-hour lifetime. Logout clears both administrator and student cookies. The student login used for homework submission remains available after administrator login.

Configure these server-only variables in Vercel for Production and Preview:

- `GIRIN_ADMIN_PASSWORD_HASH`: `scrypt:<16-byte salt in hex>:<64-byte hash in hex>`, using N=16384, r=8, p=1.
- `GIRIN_ADMIN_SESSION_SECRET`: a random secret with at least 32 characters; use separate production and preview values.

Never put credentials in public variables or commit environment files. Missing configuration denies access. Login attempts have a per-instance limit of ten attempts per five minutes.

Run `npm test` to verify credentials, session tampering, expiration, authorization roles, safe redirects and the login throttle. Run `npm run build` for the production build and TypeScript check.
