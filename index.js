const os = require('os');
const fs = require('fs');
const crypto = require('crypto');
const mkdirp = require('mkdirp');
const rimraf = require('rimraf');
const chokidar = require('chokidar');
const findprocess = require('find-process');
const paths = require('path');
const { app, BrowserWindow } = require('electron');
const yargs = require('yargs');
const util = require('util');

const WORK_DIR = paths.join(os.tmpdir(), 'electron-hta');
const LOCKS_DIR = paths.join(WORK_DIR, 'locks');
const COMMS_DIR = paths.join(WORK_DIR, 'comms');
const USER = os.userInfo().username;

/*
 * Parses the command line arguments
 */
const /* object */ parseArguments = () => (yargs
  .options({
    url: {
      alias: 'u',
      describe: 'URL to launch',
      type: 'string',
      demandOption: true,
    },
    width: {
      alias: 'x',
      describe: 'Width of the window',
      default: 1024,
      type: 'number',
    },
    height: {
      alias: 'y',
      describe: 'Height of the window',
      default: 768,
      type: 'number',
    },
    singleton: {
      alias: 's',
      describe: 'Limit to a single instance',
      default: null,
      type: 'string',
    },
    maximize: {
      alias: 'm',
      describe: 'Start the application maximized',
      default: false,
      type: 'boolean',
    },
    minimize: {
      alias: 'n',
      describe: 'Start the application minimized',
      default: false,
      type: 'boolean',
    },
    fullscreen: {
      alias: 'f',
      describe: 'Launch the window in full screen mode',
      default: false,
      type: 'boolean',
    },
    alwaysOnTop: {
      alias: 't',
      describe: 'Force the window to be always on top of other windows',
      default: false,
      type: 'boolean',
    },
    showMenu: {
      alias: 'b',
      describe: 'Show menu bar in the window',
      default: false,
      type: 'boolean',
    },
    developer: {
      alias: 'd',
      describe: 'Enable developer console',
      default: false,
      type: 'boolean',
    },
    logLevel: {
      alias: 'l',
      describe: 'Enable/disable logging (+ setting log level)',
      choices: ['NONE', 'ERROR', 'WARN', 'INFO', 'DEBUG', 'TRACE'],
      default: 'NONE',
      type: 'string',
    },
  })
  .alias('help', 'h')
  .alias('version', 'v')
  .parse(process.argv.slice(1)));

/*
 * Return the accepted URL
 */
const /* string */ parseUrl = (url) => {
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('file://')) {
    return url;
  }
  try {
    if (fs.statSync(url).isFile()) {
      return `file://${url}`;
    }
  }
  catch (e) {
    return null;
  }
  return null;
};

/*
 * Find the process with the given process ID
 */
const /* object */ findProcess = async (pid) => {
  const list = await findprocess('pid', pid);
  return list.length ? {
    pid: list[0].pid,
    ppid: list[0].ppid,
    name: list[0].name,
  } : null;
};

/**
 * Forcefully create the directory.
 * If a non-directory exists, remove it
 * and create a new directory on top of it.
 */
const /* void */ forceCreateDirectory = (dir) => {
  if (!fs.existsSync(dir)) {
    mkdirp.sync(dir);
  }
  else if (!fs.statSync(dir).isDirectory()) {
    rimraf.sync(dir);
    mkdirp.sync(dir);
  }
};

/* Get the current process name */
const PROCESS_NAME = paths.basename(process.argv0);

/* Initialise logging */
const LOG_LEVEL_NONE  = 0
const LOG_LEVEL_ERROR = 1;
const LOG_LEVEL_WARN  = 2;
const LOG_LEVEL_INFO  = 3;
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

const logFile = paths.join(WORK_DIR, 'output.log');
let _logLevel = 0;
const logger = {
  setLogLevel: (level) => {
    _logLevel = level;
  },
  trace: (msg) => {
    if (LOG_LEVEL_TRACE <= _logLevel) {
      fs.appendFile(logFile, `[TRACE] [${process.pid}] ${util.format(msg)}\n`, (err) => {});
      process.stdout.write(`${util.format(msg)}\n`);
    }
  },
  debug: (msg) => {
    if (LOG_LEVEL_DEBUG <= _logLevel) {
      fs.appendFile(logFile, `[DEBUG] [${process.pid}] ${util.format(msg)}\n`, (err) => {});
      process.stdout.write(`${util.format(msg)}\n`);
    }
  },
  info: (msg) => {
    if (LOG_LEVEL_INFO <= _logLevel) {
      fs.appendFile(logFile, `[INFO] [${process.pid}] ${util.format(msg)}\n`, (err) => {});
      process.stdout.write(`${util.format(msg)}\n`);
    }
  },
  warn: (msg) => {
    if (LOG_LEVEL_WARN <= _logLevel) {
      fs.appendFile(logFile, `[WARN] [${process.pid}] ${util.format(msg)}\n`, (err) => {});
      process.stdout.write(`${util.format(msg)}\n`);
    }
  },
  error: (msg) => {
    if (LOG_LEVEL_ERROR <= _logLevel) {
      fs.appendFile(logFile, `[ERROR] [${process.pid}] ${util.format(msg)}\n`, (err) => {});
      process.stderr.write(`${util.format(msg)}\n`);
    }
  },
};

/**
 * Main routine
 */
(async () => {
  let win = null;
  const argv = parseArguments();
  /* Extract CLI arguments */
  const {
    url,
    width,
    height,
    alwaysOnTop,
    maximize,
    minimize,
    fullscreen,
    showMenu,
    singleton,
    developer,
    logLevel,
  } = argv;

  logger.setLogLevel(LOG_LEVEL_MAP[logLevel]);

  const parsedUrl = parseUrl(url);
  if (!parsedUrl) {
    logger.error(`Invalid URL: ${url}`);
    process.exit(1);
  }

  const createWindow = (onClose) => {
    logger.debug(`Creating window.`);
    win = new BrowserWindow({
      width,
      height,
      alwaysOnTop,
      show: false,
      webPreferences: {
        partition: `${process.pid}`,
        nodeIntegration: false,
        sandbox: true,
        devTools: developer,
      },
    });
    win.loadURL(url);
    win.once('closed', onClose);
    win.once('ready-to-show', () => {
      logger.debug(`Window ready to show.`);
      win.show();
      win.setFullScreen(fullscreen);
      if (!showMenu) { win.setMenu(null); }
      if (maximize) { win.maximize(); }
      if (minimize) { win.minimize(); }
    });
  };

  const focusApp = () => {
    logger.debug('Focusing app');
    app.focus();
    if (win) {
      logger.debug('Focusing window');
      /* HACK to bring the window to the foreground. */
      win.minimize();
      win.focus();
    }
  };

  app.on('window-all-closed', () => {
    app.quit();
  });

  app.on('quit', () => {
    logger.debug(`Closing down.`);
  });

  /* If singleton mode is on, try obtaining
   * the lock (a simple lock by file checking). */
  if (singleton) {
    logger.debug(`Singleton mode (key: ${singleton})`);
    /* Always create locks in the OS temp directory. */
    forceCreateDirectory(LOCKS_DIR);
    forceCreateDirectory(COMMS_DIR);

    /* Use the hash of (singleton identifier + username) to ensure
     * every different user will have their own singleton instance
     * and eliminate any potential invalid characters that may appear
     * from simple concatination. */
    const singletonId = crypto.createHash('md5').update(`${singleton}.${USER}`).digest('hex');
    logger.debug(`Singleton ID: ${singletonId}`);
    /* Attempt to obtain lock */
    const lockFile = paths.join(LOCKS_DIR, singletonId);
    const commFile = paths.join(COMMS_DIR, singletonId);
    logger.debug(`Lock file: ${lockFile}`);
    logger.debug(`Comm file: ${commFile}`);

    let isLocked = true;
    if (fs.existsSync(lockFile)) {
      logger.debug(`Lock exists.`);
      /* Remove lock if it is not a file */
      if (!fs.statSync(lockFile).isFile()) {
        logger.debug(`Lock is directory. Removing it.`);
        rimraf.sync(lockFile);
        isLocked = false;
      }
      /* Read the PID stored in the lock file and attempt
       * to find an electron process with the same PID.
       * If a process is indeed found, that means an existing
       * instance of the singleton is already running. */
      else {
        const pid = fs.readFileSync(lockFile, 'utf8');
        logger.debug(`Lock content: ${pid}`);
        const proc = await findProcess(pid);
        logger.debug(`PID corresponds to: ${proc? proc.name : null}`);
        if (proc && proc.name === PROCESS_NAME) {
          logger.error(`Instance '${singleton}' is already running.`);
          /* Send the focus signal to the already existing singleton instance. */
          fs.writeFile(commFile, 'focus\n', (err) => {});
          app.quit();
        }
        /* In the scenario where the lock is not cleaned up correctly,
         * and we cannot find an electron process with the given PID,
         * remove the lock. */
        else {
          logger.debug(`Bad lock. Removing it.`);
          rimraf.sync(lockFile);
          isLocked = false;
        }
      }
    }
    else {
      isLocked = false;
    }

    logger.debug(isLocked ? `Lock is NOT free.` : `Lock is free.`);
    /* Only proceed if there is no problem with the lock check. */
    if (!isLocked) {
      /* Create the lock and write the current PID to the lock file. */
      logger.debug(`Creating lock file (content: ${process.pid})`);
      fs.writeFileSync(lockFile, process.pid, (err) => {
        if (err) {
          logger.error(`Unable to create lock for instance ${singleton}.`);
          app.quit();
        }
      });

      /*
       * Watch changes on the comms file for this singleton instance.
       * If new comm file is detected or if an existing comm file existed,
       * read the content and perform relevant actions.
       * The processed file is then removed until a new file is detected.
       */
      const onCommFileChange = (path) => {
        const content = fs.readFileSync(path, 'utf8');
        const actions = content ? content.split('\n') : null;
        if (actions) {
          for (let i = 0; i < actions.length; i += 1) {
            if (actions[i] === 'focus') {
              focusApp();
            }
          }
        }
        rimraf.sync(path);
      };
      logger.debug(`Watching on comm file.`);
      const watcher = chokidar.watch(commFile);
      watcher.on('add', onCommFileChange);
      watcher.on('change', onCommFileChange);

      const onClose = () => {
        logger.debug(`Closing window.`);
        win = null;
        /* Clean up lock and comm file on exit. */
         logger.debug(`Cleaning up lock and comm file.`);
        rimraf.sync(lockFile);
        rimraf.sync(commFile);
      };

      logger.debug(`Initialising windows...`);
      if (app.isReady()) {
        createWindow(onClose);
      } else {
        app.on('ready', createWindow.bind(this, onClose));
      }
    }
  }
  /* No special logic for non-singleton launch. */
  else {
    const onClose = () => {
      logger.debug(`Closing window.`);
      win = null;
    };
    logger.debug(`Initialising windows...`);
    if (app.isReady()) {
      createWindow(onClose);
    } else {
      app.on('ready', createWindow.bind(this, onClose));
    }
  }
})();
