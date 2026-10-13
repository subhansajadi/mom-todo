// Updates: MoM checks GitHub Releases for a newer version and tells the student what's new.
//
// Windows downloads the update in the background and installs it on restart (electron-updater + NSIS).
// macOS can't use electron-updater's installer, because Squirrel.Mac only accepts apps signed with an
// Apple Developer ID and MoM is ad-hoc signed. So on a Mac, MoM downloads the new .zip itself, checks its
// SHA-512 against the release's latest-mac.yml, swaps the app bundle in place and reopens. When it can't
// (running from the DMG, or no permission to write to the Applications folder), it opens the download page.
const { app, net, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const { execFile, spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const log = require('./log');

const REPO = { owner: 'subhansajadi', repo: 'mom-todo' };
const DOWNLOAD_PAGE = `https://github.com/${REPO.owner}/${REPO.repo}/releases/latest`;
const FIRST_CHECK = 15 * 1000;
const CHECK_EVERY = 6 * 60 * 60 * 1000;
const SNOOZE = 24 * 60 * 60 * 1000;
// For testing an update end to end against a local folder (see README → Releasing).
const TEST_FEED = process.env.MOM_UPDATE_FEED;

const isMac = process.platform === 'darwin';

let settings, onChange;
let info = null;        // the newer release, as electron-updater found it
let manualCheck = false;
let nudged = null;      // the version MoM has already announced since it started
let lastAttemptFailed = false;
let whatsNew = null;    // { version, notes } after MoM has just been updated

const state = {
  status: 'none',       // none, available, downloading, ready, installing, failed
  version: null,
  notes: [],
  progress: 0,
  action: null,         // install (Mac, in place), restart (Windows, downloaded), download (open the release page)
  message: null,
};

// MARK: Helpers

function newer(a, b) {
  const parts = (v) => String(v).split(/[.+-]/).slice(0, 3).map((n) => parseInt(n, 10) || 0);
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
}

/** Release notes as at most five plain lines, whether they arrive as Markdown or as GitHub's HTML. */
function noteLines(notes) {
  const text = Array.isArray(notes) ? notes.map((n) => n?.note ?? '').join('\n') : String(notes ?? '');
  return text
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\/(p|li|h\d)>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .split('\n')
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+\.)\s+/, '').replace(/\*\*|__|`/g, '').trim())
    .filter((l) => l && !l.startsWith('#'))
    .slice(0, 5)
    .map((l) => (l.length > 110 ? l.slice(0, 107) + '…' : l));
}

const snoozed = () => {
  const s = settings.get('updateSnooze');
  return !!s && s.version === state.version && Date.now() < s.until;
};

function set(changes, event) {
  Object.assign(state, changes);
  onChange?.(snapshot(), event);
}

function snapshot() {
  return { ...state, snoozed: snoozed(), whatsNew, current: app.getVersion() };
}

const run = (cmd, args) => new Promise((resolve, reject) => {
  execFile(cmd, args, (err, stdout) => (err ? reject(err) : resolve(String(stdout).trim())));
});

// MARK: Mac: swap the app bundle in place

/**
 * The release has one zip per chip. An Intel copy running on Apple silicon (through Rosetta) moves
 * to the Apple silicon build.
 */
function macZip(files) {
  const arch = process.arch === 'arm64' || app.runningUnderARM64Translation ? 'arm64' : 'x64';
  const zips = (files ?? []).filter((f) => f.url.endsWith('.zip'));
  return zips.find((f) => f.url.includes(`-${arch}.`)) ?? (zips.length === 1 ? zips[0] : null);
}

/** The .app MoM is running from, or null when it can't replace itself there. */
function macBundle() {
  const bundle = path.resolve(app.getPath('exe'), '..', '..', '..');
  if (!bundle.endsWith('.app')) return null;
  // Opened straight from the DMG, or from a quarantined folder that macOS runs from a read-only copy.
  if (bundle.startsWith('/Volumes/') || bundle.includes('/AppTranslocation/')) return null;
  try {
    fs.accessSync(path.dirname(bundle), fs.constants.W_OK);
    fs.accessSync(bundle, fs.constants.W_OK);
  } catch {
    return null;
  }
  return bundle;
}

function fileUrl(name) {
  if (TEST_FEED) return new URL(name, TEST_FEED.endsWith('/') ? TEST_FEED : TEST_FEED + '/').href;
  return `https://github.com/${REPO.owner}/${REPO.repo}/releases/download/v${info.version}/${encodeURIComponent(name)}`;
}

/** Downloads to `dest`, reporting progress, and fails unless the SHA-512 matches the release's. */
async function download(url, dest, sha512, size) {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 15 * 60 * 1000);
  try {
    const res = await net.fetch(url, { signal: abort.signal, cache: 'no-store' });
    if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
    const total = Number(res.headers.get('content-length')) || size || 0;
    const hash = crypto.createHash('sha512');
    const out = fs.createWriteStream(dest);
    let got = 0, shown = 0;
    for await (const chunk of res.body) {
      hash.update(chunk);
      got += chunk.length;
      if (!out.write(chunk)) await new Promise((r) => out.once('drain', r));
      if (total && got / total - shown >= 0.02) {
        shown = got / total;
        set({ progress: Math.min(1, shown) });
      }
    }
    await new Promise((resolve, reject) => out.end((err) => (err ? reject(err) : resolve())));
    if (hash.digest('base64') !== sha512) throw new Error('The download is damaged (checksum mismatch)');
  } finally {
    clearTimeout(timer);
  }
}

async function installMac() {
  const bundle = macBundle();
  const zip = macZip(info.files);
  if (!bundle || !zip?.sha512) return openDownloadPage();

  set({ status: 'downloading', progress: 0, message: null });
  const work = path.join(app.getPath('temp'), 'MoM-update');
  try {
    fs.rmSync(work, { recursive: true, force: true });
    fs.mkdirSync(work, { recursive: true });
    const file = path.join(work, 'MoM.zip');
    await download(fileUrl(zip.url), file, zip.sha512, zip.size);

    const unpacked = path.join(work, 'new');
    await run('/usr/bin/ditto', ['-x', '-k', file, unpacked]);
    const name = fs.readdirSync(unpacked).find((f) => f.endsWith('.app'));
    if (!name) throw new Error('No app in the download');
    const fresh = path.join(unpacked, name);
    const version = await run('/usr/bin/plutil', ['-extract', 'CFBundleShortVersionString', 'raw', path.join(fresh, 'Contents', 'Info.plist')]);
    if (version !== info.version) throw new Error(`The download is version ${version}, expected ${info.version}`);
    // An app with a broken signature won't open on Apple silicon, so don't swap one in.
    await run('/usr/bin/codesign', ['--verify', '--deep', fresh]);

    // A helper outlives MoM: it waits for MoM to quit, swaps the bundles (putting the old one back if
    // anything fails), and opens MoM again.
    const script = path.join(work, 'swap.sh');
    fs.writeFileSync(script, [
      '#!/bin/sh',
      'pid="$1"; app="$2"; new="$3"; old="$4"',
      'i=0; while kill -0 "$pid" 2>/dev/null && [ $i -lt 150 ]; do sleep 0.1; i=$((i+1)); done',
      'rm -rf "$old"',
      'if mv "$app" "$old"; then',
      '  if mv "$new" "$app"; then rm -rf "$old"; xattr -dr com.apple.quarantine "$app" 2>/dev/null',
      '  else mv "$old" "$app"; fi',
      'fi',
      'open "$app"',
    ].join('\n'));
    // The old copy waits beside the new one until the swap succeeds.
    const old = path.join(path.dirname(bundle), `.${path.basename(bundle)}.previous`);
    spawn('/bin/sh', [script, String(process.pid), bundle, fresh, old], { detached: true, stdio: 'ignore' }).unref();
    rememberPending();
    set({ status: 'installing', progress: 1 });
    log.info(`Installing ${info.version} over ${bundle}`);
    setTimeout(() => app.quit(), 300);
  } catch (err) {
    log.error('Mac update failed:', err);
    set({ status: 'failed', action: 'download', message: "Couldn't update by myself. Download the new version instead." });
  }
}

// MARK: Shared

function openDownloadPage() {
  shell.openExternal(DOWNLOAD_PAGE);
}

/** Saved before quitting, so the next start can say "I've been updated" and show what's new. */
function rememberPending() {
  settings.set('pendingUpdate', { version: info.version, notes: state.notes, from: app.getVersion() });
}

/** After a restart: did the update land? */
function reconcile() {
  const current = app.getVersion();
  const pending = settings.get('pendingUpdate');
  const last = settings.get('lastVersion');
  if (pending) {
    settings.set('pendingUpdate', null);
    if (!newer(pending.version, current)) {
      whatsNew = { version: current, notes: pending.version === current ? pending.notes ?? [] : [] };
    } else {
      lastAttemptFailed = true;
      log.warn(`The update to ${pending.version} didn't land; still on ${current}`);
    }
  } else if (last && newer(current, last)) {
    whatsNew = { version: current, notes: [] };   // updated by hand from the DMG or installer
  }
  settings.set('lastVersion', current);
}

function found(update) {
  if (!newer(update.version, app.getVersion())) return;
  info = update;
  const notes = noteLines(update.releaseNotes);
  const base = { version: update.version, notes, progress: 0, message: null };
  if (isMac) {
    const inPlace = !lastAttemptFailed && macBundle() && macZip(update.files);
    set({
      ...base,
      status: 'available',
      action: inPlace ? 'install' : 'download',
      message: inPlace ? null : lastAttemptFailed
        ? "The last update didn't finish. Download it and drag MoM into Applications."
        : 'Download it and drag the new MoM into Applications. Your tasks stay.',
    });
  } else {
    set({ ...base, status: 'downloading', action: 'restart' });   // electron-updater is already fetching it
  }
  if (nudged !== update.version && !snoozed()) {
    nudged = update.version;
    onChange?.(snapshot(), 'nudge');
  }
}

// MARK: API

function init(options) {
  ({ settings, onChange } = options);
  reconcile();

  autoUpdater.logger = log;
  autoUpdater.autoDownload = !isMac;
  autoUpdater.autoInstallOnAppQuit = !isMac;
  autoUpdater.allowDowngrade = false;
  if (TEST_FEED) {
    autoUpdater.setFeedURL({ provider: 'generic', url: TEST_FEED });
    autoUpdater.forceDevUpdateConfig = true;
  }

  autoUpdater.on('update-available', found);
  autoUpdater.on('update-not-available', () => {
    if (manualCheck) onChange?.(snapshot(), 'up-to-date');
    manualCheck = false;
  });
  autoUpdater.on('download-progress', (p) => set({ progress: (p.percent ?? 0) / 100 }));
  autoUpdater.on('update-downloaded', () => {
    set({ status: 'ready', progress: 1 });
    rememberPending();   // electron-updater installs it on the next quit even if the button isn't pressed
  });
  autoUpdater.on('error', (err) => {
    log.warn('Update check or download failed:', err?.message ?? err);
    if (manualCheck) onChange?.(snapshot(), 'check-failed');
    manualCheck = false;
    if (state.status === 'downloading' && !isMac) {
      set({ status: 'failed', action: 'download', message: "The download didn't work. You can get it from the website." });
    }
  });

  setTimeout(() => check(), FIRST_CHECK);
  setInterval(() => check(), CHECK_EVERY);
}

/** Looks for a newer version. A manual check also reports "you're up to date" or a failure. */
function check(manual = false) {
  if (!app.isPackaged && !TEST_FEED) {
    if (manual) onChange?.(snapshot(), 'dev-build');
    return;
  }
  if (['downloading', 'ready', 'installing'].includes(state.status)) {
    if (manual) onChange?.(snapshot(), 'nudge');
    return;
  }
  manualCheck = manual;
  autoUpdater.checkForUpdates().catch(() => {});   // failures arrive on the 'error' event
}

function install() {
  if (!info) return;
  if (state.action === 'download') return openDownloadPage();
  if (isMac) return installMac();
  if (state.status === 'ready') {
    set({ status: 'installing' });
    setImmediate(() => autoUpdater.quitAndInstall(true, true));
  }
}

/** Hides the update card for a day. */
function later() {
  if (state.version) settings.set('updateSnooze', { version: state.version, until: Date.now() + SNOOZE });
  set({});
}

function unsnooze() {
  settings.set('updateSnooze', null);
  set({});
}

function dismissWhatsNew() {
  whatsNew = null;
  set({});
}

module.exports = { init, check, install, later, unsnooze, dismissWhatsNew, snapshot };
