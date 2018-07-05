const os = require('os');
const fs = require('fs');
const paths = require('path');
const crypto = require('crypto');
const mkdirp = require('mkdirp');
const rimraf = require('rimraf');
const chokidar = require('chokidar');
const findprocess = require('find-process');
const yargs = require('yargs');
const urlParse = require('url-parse');
const fetch = require('node-fetch');
const { app, BrowserWindow, Menu } = require('electron');

const logger = require('./lib/simple-logger');
const { getDefaultMenuTemplate } = require('./misc/electron-menu-templates');

/* Get the current process name */
const PROCESS_NAME = paths.basename(process.argv0);
const PROCESS_PATH = paths.dirname(process.execPath);

/* Setup constants */
const WORK_DIR = paths.join(os.tmpdir(), paths.basename(PROCESS_NAME, '.exe'));
const LOCKS_DIR = paths.join(WORK_DIR, 'locks');
const COMMS_DIR = paths.join(WORK_DIR, 'comms');
const USER = os.userInfo().username;
const DEV_MODE = process.mainModule.filename.indexOf('app.asar') === -1;

const /* string */ getAsset = (assetPath) => DEV_MODE ?
    `file://${assetPath}` :
    `file://${paths.join(PROCESS_PATH, "/resources/app.asar", assetPath)}`;

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
      default: true,
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
      hidden: true,
    },
    zoom: {
      alias: 'z',
      describe: 'Set zoom factor between 0.25 and 5',
      default: 1,
      type: 'number',
    },
    logLevel: {
      alias: 'l',
      describe: 'Enable/disable logging (+ setting log level)',
      choices: ['NONE', 'ERROR', 'WARN', 'INFO', 'DEBUG', 'TRACE'],
      default: 'ERROR',
      type: 'string',
    },
  })
  .alias('help', 'h')
  .alias('version', 'v')
  .parse(process.argv.slice(1)));

/*
 * Check whether the URL format is supported and if
 * it is reachable.
 */
const /* boolean */ validateUrl = async (url) => {
  const parsed = urlParse(url);
  if (parsed.protocol === 'http:') {
    if (!parsed.port) parsed.set('port', '80');
  }
  if (parsed.protocol === 'https:') {
    if (!parsed.port) parsed.set('port', '443');
  }
  logger.debug(`Validating URL: ${parsed.href}`);
  return fetch(parsed.href, {
    method: 'HEAD',
    mode: 'no-cors',
    redirect: 'follow',
  })
    .then(response => response.ok)
    .catch(() => false);
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


/* Initialise logger */
const logFile = paths.join(WORK_DIR, 'output.log');
logger.setLogFile(logFile);

/**
 * Main routine
 */
(async () => {
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
    zoom,
  } = argv;

   /* Restrict zoom between 5 and 0.25 */
  const zoomFactor = (!zoom) ? 1 : (zoom > 5.00) ? 5.00 : (zoom < 0.25) ? 0.25 : zoom;

  logger.setLogLevel(logLevel);
  logger.debug(`Running with args:`);
  logger.debug(`  URL          : ${url}`);
  logger.debug(`  Width        : ${width}`);
  logger.debug(`  Height       : ${height}`);
  logger.debug(`  Maximize     : ${maximize}`);
  logger.debug(`  Minimize     : ${minimize}`);
  logger.debug(`  Always Top   : ${alwaysOnTop}`);
  logger.debug(`  Full Screen  : ${fullscreen}`);
  logger.debug(`  Show Menu    : ${showMenu}`);
  logger.debug(`  Singleton    : ${singleton}`);
  logger.debug(`  Zoom Factor  : ${zoomFactor}`)
  logger.debug(``);

  let win = null;
  const loadURL = url => {
    if (win) {
      win.loadURL(url);
    }
  }

  const createWindow = async () => {
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
        zoomFactor: zoomFactor,
      },
    });
    if (showMenu) {
      const template = getDefaultMenuTemplate(app, developer);
      const menu = Menu.buildFromTemplate(template);
      Menu.setApplicationMenu(menu);
    }
    else {
      Menu.setApplicationMenu(null);
    }
    win.setTitle(url);
    win.loadURL(getAsset("/assets/pages/loading.html"));
    win.once('close', () => {
      win = null;
      logger.debug('Close window.')
    });
    win.once('ready-to-show', () => {
      logger.debug(`Show window.`);
      win.show();
      win.setFullScreen(fullscreen);
      
      if (maximize) { win.maximize(); }
      if (minimize) { win.minimize(); }
    });

    const isUrlValid = await validateUrl(url);
    if (isUrlValid) {
      win.loadURL(url);
    } else {
      logger.error(`Invalid or unreachable URL: ${url}`);
      win.loadURL(getAsset("/assets/pages/invalid_url.html"));
      return;
    }
  };

  const focusApp = () => {
    logger.debug('Focusing app');
    app.focus();
    if (win) {
      logger.debug('Focusing window');
      if (os.platform() === 'win32') {
        /* HACK to bring the window to the foreground. */
        win.minimize();
      }
      win.focus();
    }
  };

  app.once('ready', createWindow);
  app.on('window-all-closed', () => {
    app.quit();
    return;
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
        logger.debug(`PID corresponds to: ${proc ? proc.name : null}`);
        if (proc && proc.name === PROCESS_NAME) {
          logger.error(`Instance '${singleton}' is already running.`);
          /* Send the focus signal to the already existing singleton instance. */
          fs.writeFileSync(commFile, 'focus\n');
          app.quit();
          return;
        }
        /* In the scenario where the lock is not cleaned up correctly,
         * and we cannot find an electron process with the given PID,
         * remove the lock. */
        logger.debug(`Bad lock. Removing it.`);
        rimraf.sync(lockFile);
        isLocked = false;
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
          return;
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

      const onQuit = () => {
        
        /* Clean up lock and comm file on exit. */
        logger.debug(`Cleaning up lock and comm file.`);
        rimraf.sync(lockFile);
        rimraf.sync(commFile);

        logger.debug(`Quit.`);
      };

      app.once('quit', onQuit);
    }
  }
  /* No special logic for non-singleton launch. */
  else {
    const onQuit = () => {
     logger.debug(`Quit.`)
    };
    app.once('quit', onQuit);
  }
})();
