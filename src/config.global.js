module.exports = {
  wsEndpoint : process.env.KUSAMA_WS_ENDPOINT || 'wss://kusama-rpc.polkadot.io',

  adminSeed : process.env.ADMIN_SEED || '//Alice',

  postgresUrl: process.env.POSTGRES_URL || 'postgres://marketplace:12345@marketplace-postgres:5432/marketplace_db',

  startFromBlock : `${process.env.KUSAMA_START_FROM_BLOCK || 'current'}`, // Either block number or 'current' to start from current block.
  ss58Format: parseInt(process.env.SS58_FORMAT || '2'),  // Kusama address format
  marketCommission: parseInt(process.env.COMMISSION || '10'), // Percents
  healthCheckMaxTimeout : parseInt(process.env.HEATHCHECK_MAX_TIMEOUT || (5 * 60)),
  inTesting: false,
  disableHealthCheck: false
};