const paths = require('path');
const cp = require('child_process');

let args = [paths.join(__dirname, 'app', 'main.js')];
args = args.concat(process.argv.slice(2));
try {
  const electron = require('electron');
  const app = cp.spawn(electron, args, {
    stdio: 'inherit',
    detached: true
  });
  app.unref();
}
catch (e) {
  process.stderr.write("Cannot launch electron.", e);
}
