const { app, BrowserWindow, screen, ipcMain, Menu, globalShortcut, Tray, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { TaskStore, Settings } = require('./store');

const isMac = process.platform === 'darwin';
const isWin = process.platform === 'win32';

// Sizes in screen points. Screen coordinates have y pointing down.
const MASCOT = { w: 230, h: 180, pad: 10 };   // the window also holds room for speech bubbles
const SPRITE = { w: 100, h: 112 };            // MoM itself, in the window's bottom-right corner
const PANEL = { w: 320, h: 440, margin: 28 }; // the margin leaves room for the list's shadow
const ARENA = { w: 560, h: 240 };

app.setPath('userData', path.join(app.getPath('appData'), 'MoM'));

let store, settings;
let mascot, panel, arena, overlay, tray;
let panelShown = false;
let lastBlurHide = 0;
let hovering = false;
let drag = null;
let lastLook = '';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const page = (name) => path.join(__dirname, 'renderer', name);
const send = (win, channel, data) => {
  if (win && !win.isDestroyed()) win.webContents.send(channel, data);
};

/** `--activity soldering` (or `--activity=soldering`) pins one activity, for testing. */
function pinnedActivity() {
  const args = process.argv;
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--activity=')) return args[i].slice(11);
    if (args[i] === '--activity') return args[i + 1];
  }
  return null;
}

/** Brings tasks over from the earlier macOS-only build the first time MoM runs. */
function migrateOldTasks(dir) {
  if (!isMac) return;
  const target = path.join(dir, 'tasks.json');
  const old = path.join(app.getPath('appData'), 'Pip', 'tasks.json');
  try {
    if (!fs.existsSync(target) && fs.existsSync(old)) {
      fs.mkdirSync(dir, { recursive: true });
      fs.copyFileSync(old, target);
    }
  } catch {}
}

// MARK: Windows

function windowOptions(extra) {
  return {
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    thickFrame: false,
    ...(isMac ? { type: 'panel' } : {}),
    ...extra,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      backgroundThrottling: false,
      ...(extra.webPreferences ?? {}),
    },
  };
}

function floatEverywhere(win, level) {
  win.setAlwaysOnTop(true, 'floating', level);
  if (isMac) win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
}

function createWindows() {
  mascot = new BrowserWindow(windowOptions({
    width: MASCOT.w,
    height: MASCOT.h,
    focusable: false,
    acceptFirstMouse: true,
    webPreferences: { autoplayPolicy: 'no-user-gesture-required' },
  }));
  floatEverywhere(mascot, 3);   // speech bubbles stay above the list
  mascot.setIgnoreMouseEvents(true);
  const origin = settings.get('origin');
  if (Array.isArray(origin)) {
    mascot.setPosition(Math.round(origin[0]), Math.round(origin[1]));
    clampToScreens();
  } else {
    resetPosition();
  }
  mascot.loadFile(page('mascot.html'));
  mascot.once('ready-to-show', () => mascot.showInactive());

  panel = new BrowserWindow(windowOptions({
    width: PANEL.w + PANEL.margin * 2,
    height: PANEL.h + PANEL.margin * 2,
  }));
  floatEverywhere(panel, 2);
  panel.loadFile(page('panel.html'));
  // Clicking anywhere else tucks the list away, like a popover.
  panel.on('blur', () => hidePanel(true));

  // The Rocket League car plays here, just under MoM, so MoM stands in front of the near end.
  arena = new BrowserWindow(windowOptions({ width: ARENA.w, height: ARENA.h, focusable: false }));
  floatEverywhere(arena, 1);
  arena.setIgnoreMouseEvents(true);
  arena.loadFile(page('arena.html'));

  // A click-through layer over the whole screen for confetti and the disco ball.
  const wa = screen.getPrimaryDisplay().workArea;
  overlay = new BrowserWindow(windowOptions({ ...wa, focusable: false }));
  floatEverywhere(overlay, 4);
  overlay.setIgnoreMouseEvents(true);
  overlay.loadFile(page('overlay.html'));
}

// MARK: Where MoM is

function spriteRect() {
  const b = mascot.getBounds();
  return {
    x: b.x + b.width - MASCOT.pad - SPRITE.w,
    y: b.y + b.height - MASCOT.pad - SPRITE.h,
    width: SPRITE.w,
    height: SPRITE.h,
  };
}

const workArea = () => screen.getDisplayMatching(spriteRect()).workArea;

function resetPosition() {
  const wa = screen.getPrimaryDisplay().workArea;
  mascot.setPosition(wa.x + wa.width - MASCOT.w - 4, wa.y + wa.height - MASCOT.h - 2);
  saveOrigin();
}

function saveOrigin() {
  const [x, y] = mascot.getPosition();
  settings.set('origin', [x, y]);
}

/** Brings MoM back if a display was unplugged or it was dragged off screen. */
function clampToScreens() {
  const s = spriteRect();
  const visible = screen.getAllDisplays().some(({ workArea: wa }) => {
    const w = Math.min(s.x + s.width, wa.x + wa.width) - Math.max(s.x, wa.x);
    const h = Math.min(s.y + s.height, wa.y + wa.height) - Math.max(s.y, wa.y);
    return w > s.width * 0.6 && h > 0;
  });
  if (!visible) resetPosition();
}

/**
 * Reads the pointer ~60 times a second: MoM's eyes follow it, it tells us when the pointer is over MoM
 * (the rest of MoM's window lets clicks through), and it moves the window while MoM is being dragged.
 */
function poll() {
  if (!mascot || mascot.isDestroyed()) return;
  const m = screen.getCursorScreenPoint();
  if (drag) {
    const dx = m.x - drag.mouse.x, dy = m.y - drag.mouse.y;
    if (drag.moved || Math.hypot(dx, dy) >= 4) {
      drag.moved = true;
      mascot.setPosition(Math.round(drag.origin[0] + dx), Math.round(drag.origin[1] + dy));
      if (panelShown) positionPanel();
    }
  }
  const s = spriteRect();
  const inside = m.x >= s.x && m.x < s.x + s.width && m.y >= s.y && m.y < s.y + s.height;
  const h = inside || !!drag;
  if (h !== hovering) {
    hovering = h;
    mascot.setIgnoreMouseEvents(!h);
    send(mascot, 'hover', h);
  }
  const look = {
    x: +clamp((m.x - (s.x + s.width / 2)) / 250, -1, 1).toFixed(3),
    y: +clamp((m.y - (s.y + 45)) / 250, -1, 1).toFixed(3),
  };
  const key = `${look.x},${look.y}`;
  if (key !== lastLook) {
    lastLook = key;
    send(mascot, 'look', look);
  }
}

// MARK: The list

function positionPanel() {
  const s = spriteRect(), wa = workArea();
  let x = s.x - PANEL.w - 4;
  if (x < wa.x + 6) x = s.x + s.width + 4;
  x = clamp(x, wa.x + 6, wa.x + wa.width - PANEL.w - 6);
  const y = clamp(s.y + s.height - PANEL.h, wa.y + 6, wa.y + wa.height - PANEL.h - 6);
  panel.setPosition(Math.round(x - PANEL.margin), Math.round(y - PANEL.margin));
}

function showPanel() {
  positionPanel();
  if (panelShown) return;
  panelShown = true;
  panel.show();
  panel.focus();
  if (isWin) mascot.moveTop();
  send(panel, 'show');
  send(mascot, 'panel-open', true);
}

function hidePanel(fromBlur = false) {
  if (!panelShown) return;
  panelShown = false;
  if (fromBlur) lastBlurHide = Date.now();
  panel.hide();
  send(mascot, 'panel-open', false);
}

function togglePanel() {
  if (panelShown) return hidePanel();
  // A click on MoM can blur the list first; don't reopen what that click just closed.
  if (Date.now() - lastBlurHide < 350) return;
  showPanel();
}

function broadcastTasks() {
  send(panel, 'tasks', store.tasks);
  send(mascot, 'counts', { remaining: store.open.length, total: store.tasks.length });
}

// MARK: Rocket League strip, confetti and disco

let arenaShown = false;
let arenaHideTimer = null;

/** To MoM's left, or to its right when there's no room on the left. */
function showArena(start) {
  const s = spriteRect(), wa = workArea();
  let x = s.x - ARENA.w + 30;
  const mirrored = x < wa.x;
  if (mirrored) x = s.x + s.width - 30;
  arena.setBounds({ x: Math.round(x), y: Math.round(s.y + s.height + 3 - ARENA.h), width: ARENA.w, height: ARENA.h });
  clearTimeout(arenaHideTimer);
  send(arena, 'start', { start, mirrored });
  send(mascot, 'arena-side', mirrored ? 1 : -1);
  if (!arenaShown) {
    arenaShown = true;
    arena.showInactive();
    if (isWin) mascot.moveTop();
  }
}

function hideArena() {
  if (!arenaShown) return;
  arenaShown = false;
  send(arena, 'stop');
  clearTimeout(arenaHideTimer);
  arenaHideTimer = setTimeout(() => arena.hide(), 280);
}

let overlayTimer = null;
let overlayUntil = 0;

function overlayOn() {
  const wa = workArea();
  const b = overlay.getBounds();
  if (b.x !== wa.x || b.y !== wa.y || b.width !== wa.width || b.height !== wa.height) overlay.setBounds(wa);
  if (!overlay.isVisible()) overlay.showInactive();
  return wa;
}

function keepOverlay(seconds) {
  overlayUntil = Math.max(overlayUntil, Date.now() + seconds * 1000);
  clearTimeout(overlayTimer);
  overlayTimer = setTimeout(() => {
    overlayUntil = 0;
    send(overlay, 'clear');
    overlay.hide();
  }, overlayUntil - Date.now());
}

// MARK: Right-click menu

function menuTemplate() {
  return [
    { label: panelShown ? 'Hide List' : 'Show List', accelerator: 'Control+Alt+T', registerAccelerator: false, click: togglePanel },
    { label: 'Throw a Party 🎉', click: () => send(mascot, 'party') },
    { type: 'separator' },
    {
      label: 'Sounds',
      type: 'checkbox',
      checked: settings.get('soundOn'),
      click: () => {
        settings.set('soundOn', !settings.get('soundOn'));
        send(mascot, 'sound', settings.get('soundOn'));
      },
    },
    {
      label: 'Open at Login',
      type: 'checkbox',
      checked: app.getLoginItemSettings().openAtLogin,
      click: () => {
        const on = !app.getLoginItemSettings().openAtLogin;
        try {
          app.setLoginItemSettings({ openAtLogin: on });
          send(mascot, 'say', on ? "I'll be here when you log in!" : "Okay, I'll wait to be opened");
        } catch {
          send(mascot, 'say', "Couldn't change that 😕");
        }
      },
    },
    { label: 'Move Back to Corner', click: () => { resetPosition(); if (panelShown) positionPanel(); } },
    { type: 'separator' },
    { label: 'Quit MoM', click: () => app.quit() },
  ];
}

// MARK: Messages from the windows

function listen() {
  ipcMain.handle('mascot:hello', () => ({
    remaining: store.open.length,
    total: store.tasks.length,
    soundOn: settings.get('soundOn'),
    activity: pinnedActivity(),
  }));
  ipcMain.on('mascot:grab-start', () => {
    drag = { mouse: screen.getCursorScreenPoint(), origin: mascot.getPosition(), moved: false };
  });
  ipcMain.on('mascot:grab-end', () => {
    if (!drag) return;
    const moved = drag.moved;
    drag = null;
    if (moved) {
      clampToScreens();
      saveOrigin();
    } else {
      togglePanel();
    }
  });
  ipcMain.on('mascot:menu', () => {
    drag = null;
    Menu.buildFromTemplate(menuTemplate()).popup({ window: mascot });
  });
  ipcMain.on('mascot:arena', (_e, { show, start }) => (show ? showArena(start) : hideArena()));
  ipcMain.on('mascot:confetti', () => {
    const wa = overlayOn();
    const s = spriteRect();
    send(overlay, 'burst', { x: s.x + s.width / 2 - wa.x, y: s.y + 10 - wa.y, count: 70, power: 1 });
    keepOverlay(3.9);
  });
  ipcMain.on('mascot:disco', (_e, { seconds }) => {
    const wa = overlayOn();
    const s = spriteRect();
    const x = clamp(s.x + s.width / 2 - 150 - wa.x, 70, wa.width - 70);
    send(overlay, 'disco', { x, drop: Math.min(360, wa.height * 0.3), duration: seconds });
    keepOverlay(seconds + 0.2);
  });

  ipcMain.handle('panel:hello', () => store.tasks);
  ipcMain.on('panel:hide', () => hidePanel());
  ipcMain.on('task:add', (_e, title) => { store.add(title); broadcastTasks(); });
  ipcMain.on('task:rename', (_e, { id, title }) => { store.rename(id, title); broadcastTasks(); });
  ipcMain.on('task:delete', (_e, id) => { store.delete(id); broadcastTasks(); });
  ipcMain.on('task:clear', () => { store.clearDone(); broadcastTasks(); });
  ipcMain.on('task:toggle', (_e, id) => {
    const completed = store.toggle(id);
    broadcastTasks();
    if (completed) send(mascot, 'completed', store.open.length);
  });
  ipcMain.handle('task:menu', (_e, { done }) => new Promise((resolve) => {
    let choice = null;
    const menu = Menu.buildFromTemplate([
      { label: 'Edit', click: () => (choice = 'edit') },
      { label: done ? 'Mark as Not Done' : 'Mark as Done', click: () => (choice = 'toggle') },
      { type: 'separator' },
      { label: 'Delete', click: () => (choice = 'delete') },
    ]);
    // Menu clicks fire just before the menu reports it closed.
    menu.popup({ window: panel, callback: () => setTimeout(() => resolve(choice), 0) });
  }));
}

// MARK: Start

function start() {
  if (isMac && app.dock) app.dock.hide();   // no Dock icon; MoM is the whole UI
  if (isWin) app.setAppUserModelId('com.subhansajadi.mom');

  const dir = app.getPath('userData');
  migrateOldTasks(dir);
  store = new TaskStore(dir);
  settings = new Settings(dir);

  listen();
  createWindows();
  setInterval(poll, 16);

  // Ctrl+Alt+T (Control-Option-T on a Mac) opens the list from anywhere.
  globalShortcut.register('Control+Alt+T', togglePanel);

  for (const event of ['display-added', 'display-removed', 'display-metrics-changed']) {
    screen.on(event, () => clampToScreens());
  }

  // Windows hides MoM from the taskbar, so give it a tray icon too.
  if (isWin) {
    const icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'icon.png')).resize({ width: 16, height: 16 });
    tray = new Tray(icon);
    tray.setToolTip('MoM');
    tray.on('click', togglePanel);
    tray.on('right-click', () => tray.popUpContextMenu(Menu.buildFromTemplate(menuTemplate())));
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showPanel());
  app.whenReady().then(start);
  app.on('window-all-closed', () => {});   // keep running; MoM has no main window
  app.on('will-quit', () => globalShortcut.unregisterAll());
}
