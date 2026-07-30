FROM node:20 AS builder
WORKDIR /app
COPY package.json ./
COPY src ./src
COPY scripts/build.js ./scripts/build.js
COPY packages/foo/package.json ./packages/foo/
RUN node ./scripts/build.js
FROM node:20
COPY --from=builder /app/dist ./dist
COPY src/index.ts ./
