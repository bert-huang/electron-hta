const os = require('os');
const fs = require('fs');
const mkdirp = require('mkdirp');
const rimraf = require('rimraf');
const findprocess = require('find-process');
const path = require('path');
const { app, BrowserWindow } = require('electron');
const yargs = require('yargs');

/*
 * Parses the command line arguments
 */
const parseArguments = () => {
  return yargs.options({
    'path': {
      alias: 'p',
      describe: 'Path (URL) to launch',
      type: 'string',
      demandOption: true,
    },
    'width': {
      alias: 'x',
      describe: 'Width of the window',
      default: 1024,
      type: 'number'
    },
    'height': {
      alias: 'y',
      describe: 'Height of the window',
      default: 768,
      type: 'number'
    },
    'singleton': {
      alias: 's',
      describe: 'Only allow a single instance',
      default: false,
      type: 'boolean',
      implies: 'singleton-id'
    },
    'singleton-id': {
      alias: 'i',
      describe: 'Identifier for the singleton option',
      default: null,
      type: 'string'
    },
    'full-screen': {
      alias: 'f',
      describe: 'Launch the window in full screen mode',
      default: false,
      type: 'boolean'
    },
    'always-on-top': {
      alias: 't',
      describe: 'Force the window to be always on top of other windows',
      default: false,
      type: 'boolean'
    },
    'show-menu': {
      alias: 'm',
      describe: 'Show menu bar in the window',
      default: false,
      type: 'boolean'
    },
  })
  .alias('help', 'h')
  .alias('version', 'v')
  .argv;
}

/*
 * Return the accepted URL
 */
const getUrl = (path) => {
  if (path.startsWith('http://') ||
      path.startsWith('https://') ||
      path.startsWith('file://')) {
    return path;
  }
  else {
    try {
      if (fs.statSync(path).isFile()) {
        return 'file://' + path;
      }
    } catch (e) {
      return null;
    }
  }
  return null;
}

/*
 * Find the process with the given process ID
 */
const findProcess = async (pid) => {
  let list = await findprocess('pid', pid);
  return list.length ? list[0] : null;
}

/**
 * Forcefully create the directory.
 * If a non-directory exists, remove it
 * and create a new directory on top of it.
 */
const forceCreateDirectory = (path) => {
  if (!fs.existsSync(path)) {
    mkdirp.sync(path);
  }
  else if (!fs.statSync(path).isDirectory()) {
    rimraf.sync(path);
    mkdirp.sync(path);
  }
}

/**
 * Main routine
 */
(async () => {
  let win = null;

  /* Extract CLI arguments */
  const argv = parseArguments();
  const width = argv['width'];
  const height = argv['height'];
  const alwaysOnTop = argv['always-on-top'];
  const fullScreen = argv['full-screen'];
  const showMenu = argv['show-menu'];
  const singleton = argv['singleton'];
  const singletonId = argv['singleton-id'];

  
  const url = getUrl(argv.path);
  if (!url) {
    process.stderr.write(`Invalid URL: ${argv.path}`);
    process.exit(1);
  }

  const createWindow = (onClose) => {
    win = new BrowserWindow({
      width,
      height,
      alwaysOnTop,
      show: false,
      webPreferences: {
        nodeIntegration: false,
        sandbox: true
      }
    });
    win.loadURL(url);
    win.once('closed', onClose);
    win.once('ready-to-show', () => {
      if (!showMenu) {
        win.setMenu(null);
      }
      win.setFullScreen(fullScreen)
      win.show();
    });
  }

  /* If singleton mode is on, try obtaining
   * the lock (a simple lock by file checking). */
  if (singleton) {
    /* Always create locks in the OS temp directory. */
    const tmpDir = path.join(os.tmpdir(), 'hta-locks');
    forceCreateDirectory(tmpDir);

    /* Attempt to obtain lock */
    const htaLock = path.join(tmpDir, singletonId);
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
            process.stderr.write(`Unable to read lock: ${singletonId}`);
            process.exit(1);
          }
        });
        const proc = await findProcess(pid);
        if (proc.name === 'electron') {
          process.stderr.write(`Instance already running: ${singletonId}`);
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
      if(err) {
        process.stderr.write(`Unable to write lock: ${singletonId}`);
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
