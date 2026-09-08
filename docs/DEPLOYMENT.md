# Deployment

There are two independent deployment systems for this app — a code change to one does not automatically require the other.

## A. Web application deployment (Docker)

`Dockerfile`:

```dockerfile
FROM node:20-alpine
RUN apk add --no-cache openssl
EXPOSE 3000
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force
COPY . .
RUN npm run build
CMD ["npm", "run", "docker-start"]
```

`docker-start` = `npm run setup && npm run start`, where `setup` = `prisma generate && prisma migrate deploy` (applies pending migrations) and `start` = `react-router-serve ./build/server/index.js`.

`NODE_ENV=production` is set explicitly in the image. This matters beyond convention: `app/services/rateLimit.server.ts` bypasses rate limiting when `NODE_ENV === "development"` — the Docker image never hits that branch, so production rate limiting is intact. Do not override `NODE_ENV` in a deploy pipeline without re-checking that.

### Required environment variables

Set these on the real hosting platform (they are **not** in `.env` — see `SHOPIFY-CONFIG.md` for what each controls):

- `SHOPIFY_API_KEY`
- `SHOPIFY_API_SECRET`
- `SHOPIFY_APP_URL` — must equal `application_url` in `shopify.app.vishal-app.toml`
- `SCOPES`
- `PORT` (defaults to 3000 via `vite.config.ts` / the built server)

`shopify app dev` auto-injects these locally through its own tunnel/config resolution; production hosting has no such auto-injection and must set them explicitly. **This has not yet been verified against a real production host as of 2026-09-08** (the app is not deployed yet — `application_url` is still the placeholder `https://example.com`).

### Database — known limitation

`prisma/schema.prisma` hardcodes the SQLite datasource:

```prisma
datasource db {
  provider = "sqlite"
  url      = "file:dev.sqlite"
}
```

This is not read from `DATABASE_URL` or any env var. Before production deployment:

1. Confirm the hosting platform gives this SQLite file **persistent** storage (many container platforms have ephemeral filesystems — a redeploy or restart would silently wipe all scheme/enquiry/session data).
2. SQLite has no real concurrent-write story across multiple app instances/replicas. If the host scales this app horizontally, switch to a networked database (Postgres/MySQL) before going live with real merchants.
3. If staying on SQLite for an initial small-scale launch, document the volume-mount/backup strategy explicitly — it is not currently documented anywhere in this repo.

This is flagged as a **high-risk item** in `APP-STORE-REVIEW.md`, not a hard blocker — but treat it as a pre-launch decision, not an afterthought.

## B. Shopify app configuration/version deployment

Shopify CLI deploys `shopify.app.vishal-app.toml` + `extensions/` as a versioned "app version":

```bash
npm run deploy   # -> shopify app deploy
```

This uploads the current TOML config and the `savings-scheme` extension. Required whenever you change:

- `access_scopes` (adding `write_files` earlier in this project's history required this)
- `application_url` / `redirect_urls`
- webhook subscriptions
- anything under `extensions/savings-scheme/`

**Not** required for a pure web-app code change (a route handler, a CSS tweak) that touches no TOML/extension file — that only needs step A (redeploy the running server).

## Release order

1. Deploy the web application (step A) first, so the new code is live at `application_url` before Shopify might route traffic to it under a new config.
2. Run `npm run deploy` (step B) if TOML/extensions changed.
3. Verify production (see `TESTING.md` Level 2/3).
4. Only then consider App Store submission (see `APP-STORE-REVIEW.md`).

## Rollback

- Web app: redeploy the previous container image/build (standard for the hosting platform in use — not yet chosen/documented as of 2026-09-08).
- Shopify config: `shopify app deploy` versions are visible in the Partner Dashboard; a previous app version can be re-released from there if a bad config version ships.
- Database migrations: Prisma migrations in `prisma/migrations/` are forward-only by default. There is no automated down-migration tooling configured in this project — a bad migration requires a manual fix-forward migration, not a `prisma migrate down`.

## Pre-deployment checklist

- [ ] `application_url` in `shopify.app.vishal-app.toml` matches the real production `SHOPIFY_APP_URL`
- [ ] `redirect_urls` includes the real callback URL for that domain
- [ ] Production env vars set (see above)
- [ ] Database persistence/backup strategy confirmed for the chosen host
- [ ] `npm run build` succeeds locally
- [ ] `npm test` and `npm run typecheck` pass
- [ ] Fresh-install test completed against the deployed URL (`TESTING.md` Level 3)
