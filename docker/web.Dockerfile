# syntax=docker/dockerfile:1
FROM node:22-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json* tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/
RUN npm install --workspaces --include-workspace-root
COPY packages/shared packages/shared
COPY packages/client packages/client
RUN npm run build -w @tland/client

FROM nginx:alpine AS runtime
RUN rm -rf /usr/share/nginx/html/*
COPY --from=build /repo/packages/client/dist /usr/share/nginx/html
COPY docker/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY docker/nginx.conf.template /etc/nginx/templates/default.conf.template
# Substitute only the upstream host; nginx's own $variables must survive.
ENV GAME_UPSTREAM=game:3000 \
    NGINX_ENVSUBST_FILTER=GAME_UPSTREAM
EXPOSE 80
HEALTHCHECK --interval=15s --timeout=3s --start-period=3s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
