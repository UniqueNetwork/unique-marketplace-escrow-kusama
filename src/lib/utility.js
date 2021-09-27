const BigNumber = require('bignumber.js');
BigNumber.config({ DECIMAL_PLACES: 12, ROUNDING_MODE: BigNumber.ROUND_DOWN, decimalSeparator: '.' });

const addLeadZero = num => {
  if(num < 10) return `0${num}`;
  return `${num}`;
}

const getTime = () => {
  let a = new Date(), hour = addLeadZero(a.getHours()), min = addLeadZero(a.getMinutes()), sec = addLeadZero(a.getSeconds());
  return `${hour}:${min}:${sec}`;
}

const getDate = () => {
  let a = new Date(), year = a.getFullYear(), month = addLeadZero(a.getMonth() + 1), date = addLeadZero(a.getDate());
  return `${year}-${month}-${date}`;
}

const terminateProcess = (code=1) => {
  // TODO: maybe some other actions to do before termination
  process.exit(code);
}

module.exports = {
  terminateProcess,
  getTime, getDate,
  BigNumber
}