# Spielserver samt gebautem Spiel.
#   docker build -t winterburg .
#   docker run -p 3000:3000 winterburg
# Hinter einem HTTPS-Proxy bzw. Tunnel betreiben (Browser verlangen im Internet wss://).

# 1) Bauen: Abhängigkeiten, Typprüfung, Vite-Build mit vorkomprimierten Dateien
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY tsconfig*.json vite.config.ts index.html ./
COPY src ./src
COPY data ./data
COPY public ./public
COPY server ./server
COPY tests/tsconfig.json ./tests/tsconfig.json
RUN npx vite build

# 2) Laufzeit: nur was der Server braucht, ohne Entwicklungswerkzeuge, nicht als root
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY tsconfig.json ./
COPY src/sim ./src/sim
COPY src/net ./src/net
COPY src/gameData.ts ./src/gameData.ts
COPY data ./data
COPY server ./server
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s CMD wget -qO- "http://127.0.0.1:${PORT}/health" || exit 1
CMD ["node", "--import", "tsx", "server/main.ts"]
