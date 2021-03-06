const util = require('./utility');

const logLevel = {
  ERROR: 'ERROR',
  RECEIVED: 'RECEIVED',
  FAILED: 'FAILED',
  INFO: 'INFO'
};

function log(message, level = logLevel.INFO) {
  if(level === logLevel.ERROR) message = message.stack || message;
  try {
    if (typeof message !== 'string') message = JSON.stringify(message);
  }
  catch(e) {}
  console.log(`[${util.getDate()} ${util.getTime()}] ${level}: ${message}`)
}


module.exports = {
  status: logLevel, log, level: logLevel
};
