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

const /* string */ getElectronProcessName = (platform) => {
  switch(platform) {
    case 'win32':
      return'electron.exe';
    case 'linux':
    case 'freebsd':
      return 'electron';
    case 'darwin':
      return 'Electron';
    default:
      return null;
  }
}

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

/* Get the platform dependent electron process name */
const ELECTRON_PROCESS_NAME = getElectronProcessName(os.platform());
if (!ELECTRON_PROCESS_NAME) {
  process.stderr.write(`Electron builds are not available on platform: ${os.platform()}`);
  process.exit(1);
}

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
  } = argv;
  const parsedUrl = parseUrl(url);
  if (!parsedUrl) {
    process.stderr.write(`Invalid URL: ${url}\n`);
    process.exit(1);
  }

  const createWindow = (onClose) => {
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
      win.show();
      win.setFullScreen(fullscreen);
      if (!showMenu) { win.setMenu(null); }
      if (maximize) { win.maximize(); }
      if (minimize) { win.minimize(); }
    });
  };

  const focusApp = () => {
    app.focus();
    if (win) {
      /* HACK to bring the window to the foreground. */
      win.minimize();
      win.focus();
    }
  };

  app.on('window-all-closed', () => {
    app.quit();
  });

  /* If singleton mode is on, try obtaining
   * the lock (a simple lock by file checking). */
  if (singleton) {
    /* Use the hash of (singleton identifier + username) to ensure
     * every different user will have their own singleton instance
     * and eliminate any potential invalid characters that may appear
     * from simple concatination. */
    const singletonId = crypto.createHash('md5').update(`${singleton}.${USER}`).digest('hex');
    let isLocked = true;

    /* Always create locks in the OS temp directory. */
    forceCreateDirectory(LOCKS_DIR);
    forceCreateDirectory(COMMS_DIR);

    /* Attempt to obtain lock */
    const lockFile = paths.join(LOCKS_DIR, singletonId);
    const commFile = paths.join(COMMS_DIR, singletonId);

    if (fs.existsSync(lockFile)) {
      /* Remove lock if it is not a file */
      if (!fs.statSync(lockFile).isFile()) {
        rimraf.sync(lockFile);
        isLocked = false;
      }
      /* Read the PID stored in the lock file and attempt
       * to find an electron process with the same PID.
       * If a process is indeed found, that means an existing
       * instance of the singleton is already running. */
      else {
        const pid = fs.readFileSync(lockFile, 'utf8');
        const proc = await findprocess('pid', pid);
        if (proc && proc.name === ELECTRON_PROCESS_NAME) {
          process.stderr.write(`Instance '${singleton}' is already running.`);
          /* Send the focus signal to the already existing singleton instance. */
          fs.writeFileSync(commFile, 'focus\n');
          process.exit(1);
        }
        /* In the scenario where the lock is not cleaned up correctly,
         * and we cannot find an electron process with the given PID,
         * remove the lock. */
        else {
          rimraf.sync(lockFile);
          isLocked = false;
        }
      }
    }
    else {
      isLocked = false;
    }

    /* Only proceed if there is no problem with the lock check. */
    if (!isLocked) {
      /* Create the lock and write the current PID to the lock file. */
      fs.writeFileSync(lockFile, process.pid, (err) => {
        if (err) {
          process.stderr.write(`Unable to create lock for instance ${singleton}.`);
          process.exit(1);
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
      const watcher = chokidar.watch(commFile);
      watcher.on('add', onCommFileChange);
      watcher.on('change', onCommFileChange);

      app.on('ready', createWindow.bind(this, () => {
        win = null;
        /* Clean up lock and comm file on exit. */
        rimraf.sync(lockFile);
        rimraf.sync(commFile);
      }));
    }
  }
  /* No special logic for non-singleton launch. */
  else {
    app.on('ready', createWindow.bind(this, () => {
      win = null;
    }));
  }
})();
