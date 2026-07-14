# Build stage
FROM node:20-alpine AS builder
WORKDIR /app

# Copy shared package first
COPY shared/package.json ./shared/
COPY shared/tsconfig.json ./shared/
COPY shared/src ./shared/src

# Copy backend package
COPY backend/package.json ./backend/

# Copy root config (tsconfig base only, NOT root package.json to avoid workspace hoisting)
COPY tsconfig.base.json ./

# Install backend dependencies standalone (no workspace hoisting)
WORKDIR /app/backend
RUN npm install

# Copy prisma and generate client
COPY backend/prisma ./prisma/
RUN npx prisma generate

# Build shared (needs access to @types/node from backend)
WORKDIR /app/shared
RUN /app/backend/node_modules/.bin/tsc --typeRoots /app/backend/node_modules/@types

# Build backend
WORKDIR /app/backend
COPY backend/tsconfig.json ./
COPY backend/tsconfig.build.json ./
COPY backend/src ./src
# Link shared package for module resolution
RUN mkdir -p node_modules/@shadowvault && ln -s /app/shared node_modules/@shadowvault/shared
RUN npx tsc -p tsconfig.build.json

# Production stage
FROM node:20-alpine AS runner
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production
ENV PRISMA_QUERY_ENGINE_LIBRARY=/app/node_modules/.prisma/client/libquery_engine-linux-musl-openssl-3.0.x.so.node

# Copy built output and production dependencies
COPY --from=builder /app/backend/package.json ./
COPY --from=builder /app/backend/node_modules ./node_modules
COPY --from=builder /app/backend/dist ./dist
COPY --from=builder /app/backend/prisma ./prisma

# Copy shared dist for runtime imports
COPY --from=builder /app/shared/dist ./node_modules/@shadowvault/shared/dist
COPY --from=builder /app/shared/package.json ./node_modules/@shadowvault/shared/

RUN mkdir -p /data/encrypted
EXPOSE 3001
CMD ["sh", "-c", "npx prisma db push --skip-generate && node dist/index.js"]
