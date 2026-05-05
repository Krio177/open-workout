FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server.js .
COPY db/ ./db/
COPY workouts/ ./workouts/
COPY public/ ./public/

EXPOSE 3000

CMD ["node", "server.js"]
