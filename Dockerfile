# Spielserver mit dem gebauten Spiel: docker build -t winterburg . && docker run -p 3000:3000 winterburg
FROM node:22-alpine
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
ENV PORT=3000
EXPOSE 3000
CMD ["npx", "tsx", "server/main.ts"]
