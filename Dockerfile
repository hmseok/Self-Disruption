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

# JWT Secret (커스텀 인증)
ENV JWT_SECRET=fmi_prod_jwt_secret_change_this

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

# JWT 인증 모듈 — standalone 번들러가 누락할 수 있으므로 수동 복사
COPY --from=builder /app/node_modules/jsonwebtoken ./node_modules/jsonwebtoken
COPY --from=builder /app/node_modules/bcryptjs ./node_modules/bcryptjs
COPY --from=builder /app/node_modules/jws ./node_modules/jws
COPY --from=builder /app/node_modules/jwa ./node_modules/jwa
COPY --from=builder /app/node_modules/safe-buffer ./node_modules/safe-buffer
COPY --from=builder /app/node_modules/buffer-equal-constant-time ./node_modules/buffer-equal-constant-time
COPY --from=builder /app/node_modules/ecdsa-sig-formatter ./node_modules/ecdsa-sig-formatter
COPY --from=builder /app/node_modules/lodash.includes ./node_modules/lodash.includes
COPY --from=builder /app/node_modules/lodash.isboolean ./node_modules/lodash.isboolean
COPY --from=builder /app/node_modules/lodash.isinteger ./node_modules/lodash.isinteger
COPY --from=builder /app/node_modules/lodash.isnumber ./node_modules/lodash.isnumber
COPY --from=builder /app/node_modules/lodash.isplainobject ./node_modules/lodash.isplainobject
COPY --from=builder /app/node_modules/lodash.isstring ./node_modules/lodash.isstring
COPY --from=builder /app/node_modules/lodash.once ./node_modules/lodash.once
COPY --from=builder /app/node_modules/ms ./node_modules/ms
COPY --from=builder /app/node_modules/semver ./node_modules/semver

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