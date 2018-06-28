'use strict';

const fs = require('fs');
const util = require('util');

/* Initialise logging */
const LOG_LEVEL_NONE = 0;
const LOG_LEVEL_ERROR = 1;
const LOG_LEVEL_WARN = 2;
const LOG_LEVEL_INFO = 3;
const LOG_LEVEL_DEBUG = 4;
const LOG_LEVEL_TRACE = 5;

const LOG_LEVEL_MAP = {
  NONE: LOG_LEVEL_NONE,
  ERROR: LOG_LEVEL_ERROR,
  WARN: LOG_LEVEL_WARN,
  INFO: LOG_LEVEL_INFO,
  DEBUG: LOG_LEVEL_DEBUG,
  TRACE: LOG_LEVEL_TRACE,
};

let _logLevel = 0;
let _logFile = undefined;
const logger = {
  /* Global Flags */
  setLogLevel: (name) => {
    _logLevel = LOG_LEVEL_MAP[name];
  },
  setLogFile: (path) => {
    _logFile = path;
  },

  /* Logging methods */
  trace: (msg) => {
    if (LOG_LEVEL_TRACE <= _logLevel) {
      if (!!_logFile) {
        fs.appendFile(_logFile, `[TRACE] [${process.pid}] ${util.format(msg)}\n`, () => {});
      }
      process.stdout.write(`${util.format(msg)}\n`);
    }
  },
  debug: (msg) => {
    if (LOG_LEVEL_DEBUG <= _logLevel) {
      if (!!_logFile) {
        fs.appendFile(_logFile, `[DEBUG] [${process.pid}] ${util.format(msg)}\n`, () => {});
      }
      process.stdout.write(`${util.format(msg)}\n`);
    }
  },
  info: (msg) => {
    if (LOG_LEVEL_INFO <= _logLevel) {
      if (!!_logFile) {
        fs.appendFile(_logFile, `[INFO] [${process.pid}] ${util.format(msg)}\n`, () => {});
      }
      process.stdout.write(`${util.format(msg)}\n`);
    }
  },
  warn: (msg) => {
    if (LOG_LEVEL_WARN <= _logLevel) {
      if (!!_logFile) {
        fs.appendFile(_logFile, `[WARN] [${process.pid}] ${util.format(msg)}\n`, () => {});
      }
      process.stdout.write(`${util.format(msg)}\n`);
    }
  },
  error: (msg) => {
    if (LOG_LEVEL_ERROR <= _logLevel) {
      if (!!_logFile) {
        fs.appendFile(_logFile, `[ERROR] [${process.pid}] ${util.format(msg)}\n`, () => {});
      }
      process.stderr.write(`${util.format(msg)}\n`);
    }
  },
};

module.exports = logger;
