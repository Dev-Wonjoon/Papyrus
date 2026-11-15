FROM node:24-trixie-slim AS build
COPY --from=oven/bun:1-debian /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY index.html tsconfig*.json vite.config.ts ./
COPY public/ public/
COPY src/ src/
RUN bun run build

FROM nginx:stable-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/ /usr/share/nginx/html/
