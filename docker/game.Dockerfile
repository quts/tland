# syntax=docker/dockerfile:1
FROM node:22-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json* tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/
# Only the workspaces this image needs. The client is a sibling in the
# lockfile, and pulling its deps in would drag Phaser and the whole frontend
# toolchain into a server image — about 150MB of download that never ships.
RUN npm install \
      --workspace @tland/shared \
      --workspace @tland/server \
      --include-workspace-root
COPY packages/shared packages/shared
COPY packages/server packages/server
RUN npm run build -w @tland/shared && npm run build -w @tland/server

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
RUN npm install --omit=dev --workspace @tland/server --include-workspace-root \
    && npm cache clean --force
COPY --from=build /repo/packages/shared/dist packages/shared/dist
COPY --from=build /repo/packages/server/dist packages/server/dist

# node:alpine already ships an unprivileged `node` user (uid 1000).
USER node
ENV GAME_PORT=3000 GAME_HOST=0.0.0.0
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.GAME_PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "packages/server/dist/index.js"]
