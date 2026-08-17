FROM node:22-slim

WORKDIR /app

COPY package.json ./
COPY config ./config
COPY data ./data
COPY scripts ./scripts
COPY src ./src
COPY issues ./issues
COPY index.html ./

ENV NODE_ENV=production

CMD ["npm", "run", "eval"]
