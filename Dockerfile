FROM node:latest

WORKDIR /src

COPY src/Marketplace.Escrow.JS .

RUN npm install

CMD ["node", "kusama_vault.js"]