FROM node:16-alpine

WORKDIR /src

COPY ./package.json .

RUN npm install

COPY src .

CMD ["node", "kusama_vault.js"]
