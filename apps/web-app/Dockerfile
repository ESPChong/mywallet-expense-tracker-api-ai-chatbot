# ── builder: full install and compile ────────────────────────
FROM node:26-alpine AS builder
WORKDIR /app
ENV HUSKY=0 \
    NEXT_TELEMETRY_DISABLED=1
# Manifests first so the `npm ci` layer caches independently of source changes.
COPY package.json package-lock.json ./
COPY apps/web-app/package.json apps/web-app/package.json
COPY apps/mobile-app/package.json apps/mobile-app/package.json
COPY packages/shared/package.json packages/shared/package.json
# Schema must exist before npm ci: web-app's postinstall runs `prisma generate`.
COPY apps/web-app/prisma apps/web-app/prisma
RUN npm ci
# Sources — node_modules and src/generated are dockerignored, so this
# can't clobber the install or the generated client.
COPY . .
ARG NEXT_PUBLIC_CURRENCY=HKD
ENV NEXT_PUBLIC_CURRENCY=$NEXT_PUBLIC_CURRENCY
RUN npm run build --workspace apps/web-app

# ── runner: production image ───────────────────────────────────────────────
FROM node:26-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000
RUN addgroup -S nodejs && adduser -S -h /home/nextjs nextjs nodejs

COPY package.json package-lock.json ./
COPY apps/web-app/package.json apps/web-app/package.json
COPY apps/mobile-app/package.json apps/mobile-app/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# Prisma CLI (devDep) for the entrypoint's schema push, plus @prisma/* with
# engines downloaded (scripts were allowed to run in the builder):
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

COPY --from=builder /app/apps/web-app/.next ./apps/web-app/.next
COPY --from=builder /app/apps/web-app/src/generated ./apps/web-app/src/generated
COPY --from=builder /app/apps/web-app/public ./apps/web-app/public
COPY --from=builder /app/apps/web-app/prisma ./apps/web-app/prisma
COPY --from=builder /app/apps/web-app/next.config.ts ./apps/web-app/next.config.ts
# shared source: the node_modules symlink npm ci created points here
COPY --from=builder /app/packages/shared ./packages/shared
COPY apps/web-app/docker/entrypoint.sh ./apps/web-app/docker/entrypoint.sh

RUN chmod +x ./apps/web-app/docker/entrypoint.sh && chown -R nextjs:nodejs /app
USER nextjs
WORKDIR /app/apps/web-app
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

ENTRYPOINT ["./docker/entrypoint.sh"]