FROM node:20-alpine AS base

FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED 1

ENV NEXT_PUBLIC_BASE_URL=https://hmseok.com
ENV NEXT_PUBLIC_SUPABASE_URL=https://uiyiwgkpchnvuvpsjfxv.supabase.co
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVpeWl3Z2twY2hudnV2cHNqZnh2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2NjkwNDgsImV4cCI6MjA4NTI0NTA0OH0.GV9zeRh5eJrbJyNY-ma1N9KUQaMGxdcn0FR6u-9vOLg

# next build는 자동으로 production 모드
RUN npm run build

FROM base AS runner
WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

# Cafe24 DB 연동
ENV CAFE24_DB_HOST=skyautosvc.co.kr
ENV CAFE24_DB_PORT=3306
ENV CAFE24_DB_USER=yangjaehee
ENV CAFE24_DB_PASSWORD=algml311!
ENV CAFE24_DB_NAME=yangjaehee

# Aligo SMS/카카오 알림톡
ENV ALIGO_API_KEY=demmiqx99912gz507w2xr3sx06brni0p
ENV ALIGO_USER_ID=fmi2bts
ENV ALIGO_SENDER_PHONE=01098289500

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# serverExternalPackages로 지정된 mysql2는 standalone에 자동 포함되지 않으므로 수동 복사
COPY --from=builder /app/node_modules/mysql2 ./node_modules/mysql2
COPY --from=builder /app/node_modules/long ./node_modules/long
COPY --from=builder /app/node_modules/iconv-lite ./node_modules/iconv-lite
COPY --from=builder /app/node_modules/safer-buffer ./node_modules/safer-buffer
COPY --from=builder /app/node_modules/lru.min ./node_modules/lru.min
COPY --from=builder /app/node_modules/named-placeholders ./node_modules/named-placeholders
COPY --from=builder /app/node_modules/denque ./node_modules/denque
COPY --from=builder /app/node_modules/generate-function ./node_modules/generate-function
COPY --from=builder /app/node_modules/sql-escaper ./node_modules/sql-escaper
COPY --from=builder /app/node_modules/aws-ssl-profiles ./node_modules/aws-ssl-profiles

USER nextjs

EXPOSE 3000

ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

CMD ["node", "server.js"]