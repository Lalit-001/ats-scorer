FROM node:22-slim

WORKDIR /app

# OpenSSL is needed by Prisma's query engine.
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

COPY package.json ./
RUN npm install

COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src

# Entrypoint chosen per service via compose `command` (start:api / start:worker).
CMD ["npm", "run", "start:api"]
