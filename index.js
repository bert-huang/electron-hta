const os = require('os');
const fs = require('fs');
const mkdirp = require('mkdirp');
const rimraf = require('rimraf');
const findprocess = require('find-process');
const paths = require('path');
const { app, BrowserWindow } = require('electron');
const yargs = require('yargs');

const WORK_DIR = paths.join(os.tmpdir(), 'electron-hta');
const LOCKS_DIR = paths.join(WORK_DIR, 'locks');

/*
 * Parses the command line arguments
 */
const /* object */ parseArguments = () => (yargs
  .options({
    path: {
      alias: 'p',
      describe: 'Path (URL) to launch',
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
      describe: 'Limit to a single instance.',
      default: null,
      type: 'string',
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
      alias: 'm',
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
const /* string */ getUrl = (url) => {
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

/**
 * Main routine
 */
(async () => {
  let win = null;

  const argv = parseArguments();
  /* Extract CLI arguments */
  const {
    path,
    width,
    height,
    alwaysOnTop,
    fullscreen,
    showMenu,
    singleton,
    developer,
  } = argv;
  const url = getUrl(path);
  if (!url) {
    process.stderr.write(`Invalid URL: ${path}`);
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
      if (!showMenu) {
        win.setMenu(null);
      }
      win.setFullScreen(fullscreen);
      win.show();
    });
  };

  app.on('window-all-closed', () => {
    app.quit();
  });

  /* If singleton mode is on, try obtaining
   * the lock (a simple lock by file checking). */
  if (singleton) {
    /* Always create locks in the OS temp directory. */
    forceCreateDirectory(LOCKS_DIR);

    /* Attempt to obtain lock */
    const htaLock = paths.join(LOCKS_DIR, singleton);
    if (fs.existsSync(htaLock)) {
      /* Remove lock if it is not a file */
      if (!fs.statSync(htaLock).isFile()) {
        rimraf.sync(htaLock);
      }
      /* Read the PID stored in the lock file and attempt
       * to find an electron process with the same PID.
       * If a process is indeed found, that means an existing
       * instance of the singleton is already running. */
      else {
        const pid = fs.readFileSync(htaLock, (err) => {
          if (err) {
            process.stderr.write(`Unable to read lock: ${singleton}`);
            process.exit(1);
          }
        });
        const proc = await findProcess(pid);
        if (proc && proc.name.toLowerCase() === 'electron') {
          process.stderr.write(`Instance already running: ${singleton}`);
          process.exit(1);
        }
        /* In the scenario where the lock is not cleaned up correctly,
         * and we cannot find an electron process with the given PID,
         * remove the lock. */
        else {
          rimraf.sync(htaLock);
        }
      }
    }
    /* Create the lock and write the current PID to the lock file. */
    fs.writeFileSync(htaLock, process.pid, (err) => {
      if (err) {
        process.stderr.write(`Unable to write lock: ${singleton}`);
        process.exit(1);
      }
    });

    app.on('ready', createWindow.bind(this, () => {
      win = null;
      /* Clean up lock file on exit. */
      rimraf.sync(htaLock);
    }));
  }

  /* No special logic for non-singleton launch. */
  else {
    app.on('ready', createWindow.bind(this, () => {
      win = null;
    }));
  }
})();
