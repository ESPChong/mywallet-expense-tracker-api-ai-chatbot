# ── deps: full install (build tooling + prisma CLI) ────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# Schema must exist before npm ci: postinstall runs `prisma generate`.
COPY prisma ./prisma
RUN npm ci

# ── builder: compile the app ───────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
COPY --from=deps /app/src/generated ./src/generated
# NEXT_PUBLIC_* values are inlined at build time — override via build args.
ARG NEXT_PUBLIC_CURRENCY=HKD
ENV NEXT_PUBLIC_CURRENCY=$NEXT_PUBLIC_CURRENCY
RUN npm run build

# ── runner: production image ───────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000
RUN addgroup -S nodejs && adduser -S -h /home/nextjs nextjs nodejs

# Production dependencies only. Scripts skipped: the generated Prisma client
# is copied from the builder instead of being regenerated here.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# Prisma CLI (a devDependency) for the entrypoint's schema push, plus its
# runtime deps under @prisma/*. If `prisma db push` ever reports a missing
# module at runtime, fall back to copying all of deps' node_modules.
COPY --from=deps /app/node_modules/prisma ./node_modules/prisma
COPY --from=deps /app/node_modules/@prisma ./node_modules/@prisma

# Build artifacts + runtime sources
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/src/generated ./src/generated
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
# Adjust the filename if your config is next.config.mjs / .js
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY docker/entrypoint.sh ./entrypoint.sh

RUN chmod +x ./entrypoint.sh && chown -R nextjs:nodejs /app
USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

ENTRYPOINT ["./entrypoint.sh"]