const config = {
  // quote network rpc.
  wsEndpoint : 'wss://kusama-rpc.polkadot.io',

  // Seed phrase of the kusama escrow admin.
  adminSeed : process.env.ADMIN_SEED || '//Alice',

  // pg sql connection.
  dbHost : process.env.DB_HOST || 'localhost',
  dbPort : process.env.DB_PORT || 5432,
  dbName : process.env.DB_NAME|| 'marketplace',
  dbUser : process.env.DB_USER || 'marketplace',
  dbPassword : process.env.DB_PASSWORD || '12345',

  // From which block to start at the first run.
  // Either block number or 'current' to start from current block.
  startFromBlock : process.env.START_FROM_BLOCK || 'current',
};

module.exports = config;