const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const log = require('./log');

const MAX_TITLE = 1000;
const MAX_UNDO = 20;

/** `{ ok: true, value }`, with `value: null` when the file doesn't exist yet, or `{ ok: false }` when it can't be read. */
function readJSON(file) {
  if (!fs.existsSync(file)) return { ok: true, value: null };
  try {
    return { ok: true, value: JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch (err) {
    log.error(`Could not read ${file}:`, err);
    return { ok: false };
  }
}

function writeJSON(file, value) {
  const json = JSON.stringify(value, null, 2);
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, json);
  try {
    fs.renameSync(tmp, file);
  } catch (err) {
    // Windows can refuse the swap while an antivirus or backup tool has the file open.
    if (!['EPERM', 'EBUSY', 'EACCES'].includes(err.code)) throw err;
    fs.writeFileSync(file, json);
    fs.rmSync(tmp, { force: true });
  }
}

/** Sets a file that couldn't be read aside, so saving never writes over what's in it. */
function keepUnreadable(file) {
  const aside = file.replace(/\.json$/, `.unreadable-${Date.now()}.json`);
  try {
    fs.renameSync(file, aside);
    log.warn(`Moved the unreadable file to ${aside}`);
  } catch (err) {
    log.error('Could not move the unreadable file aside:', err);
  }
}

const isTask = (t) => t && typeof t === 'object' && typeof t.title === 'string';

/** Keeps any fields a newer version of MoM may have added, so going back a version loses nothing. */
const clean = (list) => list.filter(isTask).map((t) => ({
  ...t,
  id: String(t.id ?? crypto.randomUUID()),
  title: t.title.slice(0, MAX_TITLE),
  done: !!t.done,
  createdAt: t.createdAt ?? new Date().toISOString(),
  doneAt: t.doneAt ?? null,
}));

/** Tasks live in tasks.json in the app's data folder, with a copy taken each time MoM starts. */
class TaskStore {
  constructor(dir) {
    fs.mkdirSync(dir, { recursive: true });
    this.file = path.join(dir, 'tasks.json');
    this.backup = path.join(dir, 'tasks.backup.json');
    this.undoStack = [];
    this.tasks = [];
    this.load();
  }

  load() {
    const read = readJSON(this.file);
    if (read.ok && (read.value == null || Array.isArray(read.value))) {
      this.tasks = clean(read.value ?? []);
      if (read.value) {
        try {
          fs.copyFileSync(this.file, this.backup);
        } catch {}
      }
      return;
    }
    // The list is damaged: keep the damaged file and fall back to the copy from the last start.
    keepUnreadable(this.file);
    const backup = readJSON(this.backup);
    if (backup.ok && Array.isArray(backup.value)) {
      log.warn('Restored tasks from tasks.backup.json');
      this.tasks = clean(backup.value);
      this.save();
    }
  }

  get open() {
    return this.tasks.filter((t) => !t.done);
  }

  /** Remembers the list before a delete or clear, so it can be undone. */
  remember() {
    this.undoStack.push(this.tasks.map((t) => ({ ...t })));
    if (this.undoStack.length > MAX_UNDO) this.undoStack.shift();
  }

  add(title) {
    const t = String(title ?? '').trim().slice(0, MAX_TITLE);
    if (!t) return;
    this.tasks.push({ id: crypto.randomUUID(), title: t, done: false, createdAt: new Date().toISOString(), doneAt: null });
    this.save();
  }

  /** Returns true when the task was just checked off. */
  toggle(id) {
    const t = this.tasks.find((x) => x.id === id);
    if (!t) return false;
    t.done = !t.done;
    t.doneAt = t.done ? new Date().toISOString() : null;
    this.save();
    return t.done;
  }

  rename(id, title) {
    const t = String(title ?? '').trim().slice(0, MAX_TITLE);
    const task = this.tasks.find((x) => x.id === id);
    if (!t || !task) return;
    task.title = t;
    this.save();
  }

  /** Returns true when something was deleted. */
  delete(id) {
    if (!this.tasks.some((t) => t.id === id)) return false;
    this.remember();
    this.tasks = this.tasks.filter((t) => t.id !== id);
    this.save();
    return true;
  }

  /** Returns how many finished tasks were cleared. */
  clearDone() {
    const done = this.tasks.filter((t) => t.done).length;
    if (!done) return 0;
    this.remember();
    this.tasks = this.tasks.filter((t) => !t.done);
    this.save();
    return done;
  }

  /** Puts back what the last delete or clear removed. */
  undo() {
    const before = this.undoStack.pop();
    if (!before) return false;
    this.tasks = before;
    this.save();
    return true;
  }

  save() {
    try {
      writeJSON(this.file, this.tasks);
    } catch (err) {
      log.error('Could not save tasks:', err);
    }
  }
}

/** Small preferences: sounds on/off, where MoM was left on screen, and update bookkeeping. */
class Settings {
  constructor(dir) {
    fs.mkdirSync(dir, { recursive: true });
    this.file = path.join(dir, 'settings.json');
    const read = readJSON(this.file);
    const valid = read.ok && read.value && typeof read.value === 'object' && !Array.isArray(read.value);
    if (!read.ok) keepUnreadable(this.file);
    this.values = { soundOn: true, origin: null, ...(valid ? read.value : {}) };
  }

  get(key) {
    return this.values[key];
  }

  set(key, value) {
    this.values[key] = value;
    try {
      writeJSON(this.file, this.values);
    } catch (err) {
      log.error('Could not save settings:', err);
    }
  }
}

module.exports = { TaskStore, Settings };
