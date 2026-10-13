// A small log file in MoM's data folder (logs/main.log), so a student can send it in with a bug report.
const fs = require('fs');
const path = require('path');

let file = null;

function init(dir) {
  try {
    const logs = path.join(dir, 'logs');
    fs.mkdirSync(logs, { recursive: true });
    file = path.join(logs, 'main.log');
    // Keep it under about 1 MB: start over, keeping one older file.
    if (fs.existsSync(file) && fs.statSync(file).size > 1_000_000) fs.renameSync(file, file + '.old');
  } catch {
    file = null;
  }
}

function text(value) {
  if (value instanceof Error) return value.stack ?? String(value);
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function write(level, args) {
  const line = args.map(text).join(' ');
  (level === 'error' ? console.error : console.log)(line);
  if (!file) return;
  try {
    fs.appendFileSync(file, `${new Date().toISOString()} ${level.toUpperCase()} ${line}\n`);
  } catch {}
}

module.exports = {
  init,
  info: (...args) => write('info', args),
  warn: (...args) => write('warn', args),
  error: (...args) => write('error', args),
  debug: () => {},
};
