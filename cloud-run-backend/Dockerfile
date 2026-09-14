FROM node:24-slim

WORKDIR /app

COPY package.json ./
COPY server.mjs ./

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

CMD ["npm", "start"]
