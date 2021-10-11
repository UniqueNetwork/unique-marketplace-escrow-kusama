# Unique Marketplace API

## Glossary

- *Quote* - an ID of a currency used to pay for NFT tokens.
- *Seller* - a person who wants to sell a NFT token.
- *Buyer* - a person who wants to buy a NFT token.

## How does the whole system works

Seller sends token to escrow admin and sets it's quote price.
Escrow creates an offer.
Buyer sends quote to Escrow.
Escrow sends token to the Buyer and quote to the Seller.
The Buyer and the Seller can get back what they sent.

## What does it do

- For each quote sent to admin it subtracts market fee and schedules a call to [Matcher Contracts]() method `registerDeposit` for [Unique Escrow](https://github.com/UniqueNetwork/unique-marketplace-escrow) to call.
- For each outgoing quote scheduled by [Unique Escrow](https://github.com/UniqueNetwork/unique-marketplace-escrow) sends quote to it's owner. Sends either token price to seller or deposited quote plus market fee back to the address who sent quote to admin.

## How to run

Copy `lib/config.global.js` to `lib/config.dev.js` and edit it, or set env variables. See `docker-compose.example.yml` for details.
Run either with `npm install & npm run` or with docker.
