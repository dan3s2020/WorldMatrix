# WorldGuard shared world: website + multiplayer server. Zero npm dependencies.
FROM node:22-alpine
WORKDIR /app
COPY . .
ENV PORT=8787 TICK_MS=1000
EXPOSE 8787
VOLUME ["/app/server/data"]
CMD ["node", "server/server.mjs"]
