const os = require('os');
const fs = require('fs');
const cp = require('child_process');
const paths = require('path');

const defaultMenuTemplate = (app, isDev) => {
  const template = [
    { label: 'File',
      submenu: [
        {role: 'quit'},
      ]},
    { label: 'Edit',
      submenu: [
        {role: 'undo'},
        {role: 'redo'},
        {type: 'separator'},
        {role: 'cut'},
        {role: 'copy'},
        {role: 'paste'},
        {role: 'pasteandmatchstyle'},
        {role: 'delete'},
        {role: 'selectall'},
      ]},
    { label: 'View',
      submenu: [
        {role: 'reload'},
        {role: 'forcereload'},
        ... isDev ? [{role: 'toggledevtools'}] : [],
        {type: 'separator'},
        {role: 'resetzoom'},
        {role: 'zoomin'},
        {role: 'zoomout'},
        {type: 'separator'},
        {role: 'togglefullscreen'},
      ]},
    { role: 'window',
      submenu: [
        {role: 'minimize'},
        {role: 'close'},
      ]},
  ];

  if (os.platform() === 'darwin') {
    template.unshift({
      label: app.getName(),
      submenu: [
        {role: 'about'},
        {type: 'separator'},
        {role: 'services', submenu: []},
        {type: 'separator'},
        {role: 'hide'},
        {role: 'hideothers'},
        {role: 'unhide'},
        {type: 'separator'},
        {role: 'quit'},
      ],
    });
    // Edit menu
    template[1].submenu.push(
      {type: 'separator'},
      {
        label: 'Speech',
        submenu: [
          {role: 'startspeaking'},
          {role: 'stopspeaking'},
        ],
      }
    );
    // Window menu
    template[3].submenu = [
      {role: 'close'},
      {role: 'minimize'},
      {role: 'zoom'},
      {type: 'separator'},
      {role: 'front'},
    ];
  };
  return template;
}

const getRunMenuItem = (execPrefFile) => {
  const runMenu = {
    label: 'Run',
    submenu: [
      {label: 'Add Exec'},
      {type: 'separator'},
    ],
  }

  if (fs.existsSync(execPrefFile) && fs.statSync(execPrefFile).isFile()) {
    let execList;
    try {
      execList = JSON.parse(fs.readFileSync(execPrefFile, 'utf8'));
    } catch (e) { process.stderr(e) }
    if (execList) {
      for (let i = 0; i < execList.length; i++) {
        const execItem = execList[i];
        runMenu.submenu.push({
          label: execItem.name,
          click: () => {
            try {
              const app = cp.spawn(execItem.process, execItem.args, {
                stdio: 'inherit',
                detached: true
              });
              app.unref();
            } catch (e) { process.stderr(e) }
          }
        })
      }
    }
  }
  return runMenu;
}

module.exports = {
  defaultMenuTemplate,
  getRunMenuItem,
};