# Digital Switching System - backend (NestJS)
# Not used for local dev in this environment (Docker isn't installed here) -
# provided for staging/production deployment per proposal §11/§14.

FROM node:24-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:24-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Reuses the builder's full node_modules rather than a fresh `npm ci
# --omit=dev`: the entrypoint runs `prisma migrate deploy` at container
# startup, which needs the `prisma` CLI (a devDependency) - trimming it here
# would make the entrypoint fail at runtime. The CLI's own dependency chain
# has a couple of dev-tool-only CVEs (see docs/production-readiness.md);
# accepted since nothing reachable via the running HTTP server invokes it.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package*.json ./
COPY prisma ./prisma
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "dist/main.js"]
