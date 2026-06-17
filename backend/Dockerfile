FROM node:22-slim

WORKDIR /app

COPY package.json ./
RUN npm install

COPY tsconfig.json .sequelizerc ./
COPY config ./config
COPY src ./src
COPY migrations ./migrations

# Entrypoint chosen per service via compose `command` (start:api / start:worker).
CMD ["npm", "run", "start:api"]
