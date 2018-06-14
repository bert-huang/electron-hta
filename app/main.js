const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const argv = require('yargs')
  .options({
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

let win = null;
const url = getUrl(argv.path);
const createWindow = () => {
	win = new BrowserWindow({
    show: false,
    width: argv['width'],
		height: argv['height'],
		alwaysOnTop: argv['always-on-top'],
    fullscreen: argv['fullscreen'],
    
    webPreferences: {
			nodeIntegration: false,
      sandbox: true
    }
  });

  win.once('closed', () => { win = null });
  win.once('ready-to-show', () => {
    win.show();
    if (!argv['show-menu']) {
			win.setMenu(null);
    }
  });
  win.loadURL(url);
}

app.on('ready', createWindow);
