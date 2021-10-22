const { ApiPromise, WsProvider, Keyring } = require('@polkadot/api');
const delay = require('delay');
const config = require('./config').getConfig();
const { decodeAddress, encodeAddress } = require('@polkadot/util-crypto');
const { v4: uuidv4 } = require('uuid');
const {addMarketFeeToPrice, subtractMarketFeeFromTotal} = require('./market_fee');
const {util, constants, logging} = require('./lib');
const log = logging.log;
const BigNumber = util.BigNumber;

const { Client } = require('pg');

const pgTables = {
  incomingTx: 'QuoteIncomingTransaction',
  outgoingTx: 'QuoteOutgoingTransaction',
  kusamaBlocks: 'KusamaProcessedBlock'
}
const withdrawTypes = {
  TYPE_UNUSED: 0,
  TYPE_MATCHED: 1
}
const kusamaBlockMethods = {
  METHOD_TRANSFER_KEEP_ALIVE: 'transferKeepAlive',
  METHOD_TRANSFER: 'transfer'
}

let dbClient = null;
let adminAddress;

let healthCheck = {
  lastAction: 0,
  state: constants.healthState.STATE_IDLE
}
healthCheck.updateState = (state = constants.healthState.STATE_IDLE, onlyState=false) => {
  if(!onlyState) healthCheck.lastAction = (new Date()).getTime();
  if(healthCheck.state !== state) log(`Process state changed to ${state}`, logging.status.INFO);
  healthCheck.state = state;
}

async function getKusamaConnection() {
  // Initialise the provider to connect to the node
  const wsProvider = new WsProvider(config.wsEndpoint);

  // Create the API and wait until ready
  const api = new ApiPromise({ provider: wsProvider });

  api.on('disconnected', async (value) => {
    log(`disconnected: ${value}`, logging.status.ERROR);
    util.terminateProcess();
  });
  api.on('error', async (value) => {
    log(`error: ${value}`, logging.status.ERROR);
    util.terminateProcess();
  });

  await api.isReady;

  return api;
}

async function getDbConnection() {
  if (!dbClient) {
    dbClient = new Client({
      user: config.dbUser,
      host: config.dbHost,
      database: config.dbName,
      password: config.dbPassword,
      port: config.dbPort
    });
    dbClient.connect();
    dbClient.on('error', err => {
      log(`Postgres server error: ${err}`, logging.status.ERROR);
      util.terminateProcess();
    });
    log("Connected to the DB");
  }
  return dbClient;
}

async function getLastHandledKusamaBlock(api) {
  const conn = await getDbConnection();
  const res = await conn.query(`SELECT * FROM public."${pgTables.kusamaBlocks}" ORDER BY public."${pgTables.kusamaBlocks}"."BlockNumber" DESC LIMIT 1;`);
  return (res.rows.length > 0) ? res.rows[0].BlockNumber : await getStartingBlock(api);
}

async function getStartingBlock(api) {
  if('current'.localeCompare(config.startFromBlock, undefined, {sensitivity: 'accent'}) === 0) {
    const head = await api.rpc.chain.getHeader();
    const block = head.number.toNumber();
    return block - 10; // start 10 blocks behind
  }

  return parseInt(config.startFromBlock);
}

async function addHandledKusamaBlock(blockNumber) {
  const conn = await getDbConnection();
  await conn.query(`INSERT INTO public."${pgTables.kusamaBlocks}" VALUES ($1, now());`, [blockNumber]);
}

function toHexString(byteArray) {
  let hex = '';
  for (let i=0; i<byteArray.length; i++) {
    hex += byteArray[i].toString(16).padStart(2, '0');
  }
  return hex;
}

async function addIncomingKusamaTransaction(amount, address, blockNumber) {
  const conn = await getDbConnection();

  // Convert address into public key
  const publicKey = toHexString(decodeAddress(address));

  await conn.query(`INSERT INTO public."${pgTables.incomingTx}"("Id", "Amount", "QuoteId", "Description", "AccountPublicKey", "BlockId", "Status", "LockTime", "ErrorMessage") VALUES ($1, $2, 2, \'\', $3, $4, 0, null, null);`,
    [uuidv4(), amount, publicKey, blockNumber]);
}

async function setOutgoingKusamaTransactionStatus(id, status, error = "OK") {
  const conn = await getDbConnection();

  // Get one non-processed Kusama transaction
  await conn.query(`UPDATE public."${pgTables.outgoingTx}" SET "Status" = $1, "ErrorMessage" = $2 WHERE public."${pgTables.outgoingTx}"."Id" = $3`,
    [status, error, id]);
}

async function getOutgoingKusamaTransaction() {
  const conn = await getDbConnection();

  // Get one non-processed Kusama transaction
  const res = await conn.query(`SELECT * FROM public."${pgTables.outgoingTx}" WHERE public."${pgTables.outgoingTx}"."Status" = 0 AND public."${pgTables.outgoingTx}"."QuoteId" = 2 LIMIT 1`);

  let ksmTx = {
    id: '',
    amount: '0',
    recipient: null,
    withdrawType: 0
  };

  if (res.rows.length > 0) {
    // Decode from base64
    let publicKey = Buffer.from(res.rows[0].RecipientPublicKey, 'base64');

    try {
      // Convert public key into address
      const address = encodeAddress(publicKey);

      ksmTx.id = res.rows[0].Id;
      ksmTx.recipient = address;
      ksmTx.amount = res.rows[0].Value;
      ksmTx.withdrawType = res.rows[0].WithdrawType;
    }
    catch (e) {
      await setOutgoingKusamaTransactionStatus(res.rows[0].Id, 2, e.toString());
      log(e, logging.status.ERROR);
    }

  }

  return ksmTx;
}

async function scanKusamaBlock(api, blockNum) {
  if (blockNum % 10 === 0) log(`Scanning Block #${blockNum}`);
  const blockHash = await api.rpc.chain.getBlockHash(blockNum);

  const signedBlock = await api.rpc.chain.getBlock(blockHash);
  const allRecords = await api.query.system.events.at(blockHash);

  let processBlock = async (ex, index) => {
    let { _isSigned, _meta, method: { args, method, section } } = ex;
    if (method === kusamaBlockMethods.METHOD_TRANSFER_KEEP_ALIVE) method = kusamaBlockMethods.METHOD_TRANSFER;
    if ((section === "balances") && (method === kusamaBlockMethods.METHOD_TRANSFER) && (args[0].toString() === adminAddress)) {
      const events = allRecords
        .filter(({phase}) =>
          phase.isApplyExtrinsic &&
          phase.asApplyExtrinsic.eq(index)
        )
        .map(({event}) => `${event.section}.${event.method}`);

      if (events.includes('system.ExtrinsicSuccess')) {
        log(`Quote deposit in block ${blockNum} from ${ex.signer.toString()} amount ${args[1]}`, logging.status.RECEIVED);

        // Register Quote Deposit (save to DB)
        const amount = args[1];
        const address = ex.signer.toString();

        const amountMinusFee = subtractMarketFeeFromTotal(new BigNumber(amount), BigNumber.ROUND_UP);

        await addIncomingKusamaTransaction(amountMinusFee.toString(), address, blockNum);
      } else {
        log(`Quote deposit from ${ex.signer.toString()} amount ${args[1]}`, logging.status.FAILED);
      }
    }
  }

  await signedBlock.block.extrinsics.forEach(processBlock);

}

function getTransactionStatus(events, status) {
  if (status.isReady) {
    return constants.transactionStatus.STATUS_NOT_READY;
  }
  if (status.isBroadcast) {
    return constants.transactionStatus.STATUS_NOT_READY;
  }
  if(status.isRetracted) {
    return constants.transactionStatus.STATUS_NOT_READY;
  }
  if (status.isInBlock || status.isFinalized) {
    if(events.filter(e => e.event.data.method === 'ExtrinsicFailed').length > 0) {
      return constants.transactionStatus.STATUS_FAIL;
    }
    if(events.filter(e => e.event.data.method === 'ExtrinsicSuccess').length > 0) {
      return constants.transactionStatus.STATUS_SUCCESS;
    }
  }

  return constants.transactionStatus.STATUS_FAIL;
}

function sendTxAsync(sender, transaction) {
  return new Promise(async (resolve, reject) => {
    try {
      let unsub = await transaction.signAndSend(sender, ({ events = [], status }) => {
        const transactionStatus = getTransactionStatus(events, status);

        if (transactionStatus === constants.transactionStatus.STATUS_SUCCESS) {
          log(`Transaction successful`);
          resolve(events);
          unsub();
        } else if (transactionStatus === constants.transactionStatus.STATUS_FAIL) {
          log(`Something went wrong with transaction. Status: ${status}`);
          reject(events);
          unsub();
        }
      });
    } catch (e) {
      log('Error: ' + e.toString(), logging.status.ERROR);
      reject(e);
    }
  });
}

async function withdrawAsync(api, sender, recipient, amount, withdrawType) {
  let amountBN = new BigNumber(amount);
  if (parseInt(withdrawType) === withdrawTypes.TYPE_UNUSED) {
    await withdrawUnused(api, sender, recipient, amountBN);
  }
  else {
    await withdrawMatched(api, sender, recipient, amountBN);
  }
}

async function withdrawMatched(api, sender, recipient, amountBN) {
  log(`Quote withdraw matched: ${recipient.toString()} withdarwing amount ${amountBN.toString()}`,"START");
  await transfer(api, sender, recipient, amountBN);
}

async function withdrawUnused(api, sender, recipient, amountBN) {
    // Withdraw unused => return commission
    amountBN = addMarketFeeToPrice(amountBN, BigNumber.ROUND_DOWN);
    log(`Quote withdraw unused: ${recipient.toString()} withdarwing amount ${amountBN.toString()}`, "START");
    await transfer(api, sender, recipient, amountBN);
}


async function transfer(api, sender, recipient, amountBN) {
  const totalBalanceObj = await api.query.system.account(sender.address)
  const totalBalance = new BigNumber(totalBalanceObj.data.free);
  log(`amountBN = ${amountBN.toString()}`);
  log(`Total escrow balance = ${totalBalance.toString()}`);

  if (totalBalance.isLessThan(amountBN)) {
    const error = `Escrow balance ${totalBalance.toString()} is insufficient to send ${amountBN.toString()} to ${recipient.toString()}.`;
    log(error);
    throw error;
  }

  let balanceTransaction = api.tx.balances.transfer(recipient, amountBN.toString());
  await sendTxAsync(sender, balanceTransaction);
}

async function catchUpWithBlocks(api) {
  const finalizedHash = await api.rpc.chain.getFinalizedHead();
  const signedFinalizedBlock = await api.rpc.chain.getBlock(finalizedHash);
  while (true) {
    let success = true;
    try {

      // Get the last processed block
      let lastKusamaBlock = parseInt(await getLastHandledKusamaBlock(api));

      if (lastKusamaBlock + 1 <= parseInt(`${signedFinalizedBlock.block.header.number}`)) {
        lastKusamaBlock++;

        // Handle Kusama Deposits (by analysing block transactions)
        await scanKusamaBlock(api, lastKusamaBlock);
        await addHandledKusamaBlock(lastKusamaBlock);

      } else break;

    } catch (ex) {
      log(ex, logging.status.ERROR);
      success = false;
      await delay(1000);
    }

    if(success) healthCheck.updateState();
  }
}

async function handleQueuedWithdrawals(api, admin) {
  let withdrawal = false;
  do {
    withdrawal = false;
    const ksmTx = await getOutgoingKusamaTransaction();
    if (ksmTx.id.length > 0) {
      withdrawal = true;

      try {
        // Handle withdrawals by type (withdraw or match )
        let withdrawType = ksmTx.withdrawType;
        let amountReturned = new BigNumber(ksmTx.amount);

        healthCheck.updateState(constants.healthState.STATE_TRANSACTION, true);

        // Set status before handling (safety measure)
        await setOutgoingKusamaTransactionStatus(ksmTx.id, 1);
        await withdrawAsync(api, admin, ksmTx.recipient, amountReturned.toString(), withdrawType);
      }
      catch (e) {
        await setOutgoingKusamaTransactionStatus(ksmTx.id, 2, e);
      }
      finally {
        healthCheck.updateState(constants.healthState.STATE_IDLE, true);
        log(`Quote withdraw: ${ksmTx.recipient.toString()} withdarwing amount ${ksmTx.amount}`, "END");
      }
    }
  } while (withdrawal);
}

async function handleKusama() {
  const api = await getKusamaConnection();
  const keyring = new Keyring({ type: 'sr25519', ss58Format: config.ss58Format });
  const admin = keyring.addFromUri(config.adminSeed);
  adminAddress = admin.address.toString();
  log(`Escrow admin address: ${adminAddress}`);

  // Work indefinitely
  while (true) {
    // 1. Catch up with blocks
    await catchUpWithBlocks(api);

    healthCheck.updateState();

    await delay(1000);

    // 2. Handle queued withdrawals
    await handleQueuedWithdrawals(api, admin);

    healthCheck.updateState();

    await delay(1000);
  }
}

const checkHealth = () => {
  let now = (new Date()).getTime();
  let isTimeout = healthCheck.lastAction < (now - (config.healthCheckMaxTimeout * 1000));
  if(isTimeout) {
    if(healthCheck.state === constants.healthState.STATE_TRANSACTION) {
      log('Process still in transaction', logging.status.INFO);
      return;
    }
    // Process in idle state, but updates stopped (Maybe we lost some connections)
    if(!config.disableHealthCheck) util.terminateProcess();
    else log('Process currently in unhealthy state');
  }
}

async function main() {
  healthCheck.updateState();
  setInterval(checkHealth, 5 * 1000);
  await handleKusama();
}

main().catch(console.error).finally(() => process.exit());

