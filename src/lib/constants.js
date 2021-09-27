const transactionStatus = {
  STATUS_NOT_READY: 'NotReady',
  STATUS_FAIL: 'Fail',
  STATUS_SUCCESS: 'Success'
};

const healthState = {
  STATE_TRANSACTION: 'in_transaction',
  STATE_IDLE: 'idle'
}

module.exports = {
  transactionStatus, healthState
};