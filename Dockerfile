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

# Prisma 클라이언트 생성 (빌드 전 필수)
RUN npx prisma generate

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

# Supabase Service Role Key (서버 사이드 API용)
ENV SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVpeWl3Z2twY2hudnV2cHNqZnh2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTY2OTA0OCwiZXhwIjoyMDg1MjQ1MDQ4fQ.wrYL2q5Mvcna6ZGlmAOHELWMMNWGoVyGztITMeF83lA

# 오픈뱅킹 API (금융결제원)
ENV OPENBANKING_CLIENT_ID=9256a13a-1614-449c-bddb-32d8aee5f354
ENV OPENBANKING_CLIENT_SECRET=f2b40731-c7c5-4182-b1b5-9a9f7702796a
ENV OPENBANKING_API_HOST=https://testapi.openbanking.or.kr
ENV OPENBANKING_REDIRECT_URI=https://hmseok.com/api/openbanking/callback

# Codef API (Demo Credentials)
ENV CODEF_CLIENT_ID=64132559-5368-4f43-8918-aedbfc7c3ea0
ENV CODEF_CLIENT_SECRET=7fb37e4b-fe96-4a4d-93b0-8f4fd8a3124b
ENV CODEF_PUBLIC_KEY=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEArd5iIdcfWNfEOv0U68sDl1x6Rmpc8Shf3J1lVtBnZoXH2lAIPoSy7GiJQN42fptjAocM8KesXvCF4GrljViFtRAYfkdQCB/mcjT4ZFZcm9r8chpEsw5grBMushaRl1Kfh4lUVLB2sJDNA42V1YTSZAvx+oM2vmQxFGpDEoC7KWRjZzM8tmPtE1cvzkJR6M2vC0Zv0SnofHOTSaFnY6x3o8511KrJvGfQ3ThUh6jR8zJmCbGMIMShBLVbnkpnkzzT+jpkiqP2MKbqlakCuKMx6RhljYrhSTG21vsRrg/2ovmdpqD79yVrvc4W/MUgVylcBrfTCnDkM5JajFjpY1hTpwIDAQAB
ENV CODEF_API_HOST=https://development.codef.io
ENV CODEF_TOKEN_URL=https://oauth.codef.io/oauth/token

# ============================================================
# Google Cloud SQL (fmi_op) — Phase 3 이후 Supabase 대체
# Connection: secondlife-485816:asia-northeast3:r-care-db
# Public IP : 34.47.105.219:3306
# Cloud Run에서는 Unix Socket 방식 사용 (가장 빠르고 안전)
# ============================================================
# ENV DATABASE_URL="mysql://root:FILL_PASSWORD@localhost/fmi_op?socket=/cloudsql/secondlife-485816:asia-northeast3:r-care-db"

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Prisma 클라이언트 — standalone에 포함되지 않으므로 수동 복사
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# serverExternalPackages mysql2 — standalone에 자동 포함되지 않으므로 수동 복사
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