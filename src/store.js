const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function readJSON(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function writeJSON(file, value) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, file);
}

/** Tasks live in tasks.json in the app's data folder. */
class TaskStore {
  constructor(dir) {
    fs.mkdirSync(dir, { recursive: true });
    this.file = path.join(dir, 'tasks.json');
    const data = readJSON(this.file);
    this.tasks = Array.isArray(data)
      ? data
          .filter((t) => t && typeof t.title === 'string')
          .map((t) => ({
            id: String(t.id ?? crypto.randomUUID()),
            title: t.title,
            done: !!t.done,
            createdAt: t.createdAt ?? new Date().toISOString(),
            doneAt: t.doneAt ?? null,
          }))
      : [];
  }

  get open() {
    return this.tasks.filter((t) => !t.done);
  }

  add(title) {
    const t = String(title ?? '').trim();
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
    const t = String(title ?? '').trim();
    const task = this.tasks.find((x) => x.id === id);
    if (!t || !task) return;
    task.title = t;
    this.save();
  }

  delete(id) {
    this.tasks = this.tasks.filter((t) => t.id !== id);
    this.save();
  }

  clearDone() {
    this.tasks = this.tasks.filter((t) => !t.done);
    this.save();
  }

  save() {
    try {
      writeJSON(this.file, this.tasks);
    } catch (err) {
      console.error('Could not save tasks:', err);
    }
  }
}

/** Small preferences: sounds on/off and where MoM was left on screen. */
class Settings {
  constructor(dir) {
    fs.mkdirSync(dir, { recursive: true });
    this.file = path.join(dir, 'settings.json');
    this.values = { soundOn: true, origin: null, ...(readJSON(this.file) ?? {}) };
  }

  get(key) {
    return this.values[key];
  }

  set(key, value) {
    this.values[key] = value;
    try {
      writeJSON(this.file, this.values);
    } catch (err) {
      console.error('Could not save settings:', err);
    }
  }
}

module.exports = { TaskStore, Settings };
