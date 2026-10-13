const { send, invoke, on } = window.mom;

const $ = (id) => document.getElementById(id);
const card = $('card');
const draft = $('draft');
const body = $('body');

let tasks = [];
let editing = null;      // id of the task being renamed
let known = null;        // ids already on screen, so new rows can slide in
let scroll = null;
let update = null;       // what updates.js reports: a new version, or what's new after updating
let toastTimer = null;

const CHECK = '<svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 5.3l2 2L8.2 2.8" fill="none" stroke="#e10600" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const CROSS = '<svg width="10" height="10" viewBox="0 0 10 10"><path d="M2.5 2.5l5 5M7.5 2.5l-5 5" stroke="rgba(255,255,255,0.68)" stroke-width="1.8" stroke-linecap="round"/></svg>';

const openTasks = () => tasks.filter((t) => !t.done);
const doneTasks = () => tasks.filter((t) => t.done).sort((a, b) => Date.parse(b.doneAt ?? 0) - Date.parse(a.doneAt ?? 0));

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text != null) e.textContent = text;
  return e;
}

// MARK: Rows

function row(t, isNew) {
  const r = el('div', `row${t.done ? ' done' : ''}${isNew ? ' enter' : ''}${editing === t.id ? ' editing' : ''}`);
  r.dataset.id = t.id;
  const check = el('div', 'check');
  check.innerHTML = CHECK;
  r.append(check);

  if (editing === t.id) {
    const input = el('input', 'title-text');
    input.value = t.title;
    input.spellcheck = false;
    const commit = () => {
      if (editing !== t.id) return;
      editing = null;
      if (input.value.trim() && input.value !== t.title) send('task:rename', { id: t.id, title: input.value });
      render();
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') commit();
      if (e.key === 'Escape') {
        e.stopPropagation();
        editing = null;
        render();
      }
    });
    input.addEventListener('blur', commit);
    r.append(input);
    requestAnimationFrame(() => {
      input.focus();
      input.select();
    });
  } else {
    r.append(el('div', 'title-text', t.title));
    const del = el('button', 'del');
    del.title = 'Delete';
    del.innerHTML = CROSS;
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      send('task:delete', t.id);
    });
    r.append(del);
  }

  r.addEventListener('click', () => {
    if (editing !== t.id) send('task:toggle', t.id);
  });
  r.addEventListener('contextmenu', async (e) => {
    e.preventDefault();
    const choice = await invoke('task:menu', { done: t.done });
    if (choice === 'edit') {
      editing = t.id;
      render();
    } else if (choice === 'toggle') {
      send('task:toggle', t.id);
    } else if (choice === 'delete') {
      send('task:delete', t.id);
    }
  });
  return r;
}

// MARK: Render

/** Rows that move (checked off, unchecked, or pushed down) glide to their new place. */
function positions() {
  const map = new Map();
  for (const r of body.querySelectorAll('.row')) map.set(r.dataset.id, r.getBoundingClientRect().top);
  return map;
}

function render() {
  const before = positions();
  const open = openTasks();
  const done = doneTasks();

  $('status').textContent = tasks.length === 0 ? 'nothing yet' : open.length === 0 ? 'all done!' : `${open.length} to go`;
  const frac = tasks.length ? (tasks.length - open.length) / tasks.length : 0;
  $('fill').style.width = frac > 0 ? `max(8px, ${frac * 100}%)` : '0';

  const firstRender = known === null;
  const isNew = (id) => !firstRender && !known.has(id);
  known = new Set(tasks.map((t) => t.id));

  if (tasks.length === 0) {
    scroll = null;
    const empty = el('div', 'empty');
    empty.append(el('div', 'icon', '📋'), el('div', 'title', 'Nothing on the list yet'));
    const sub = el('div', 'sub');
    sub.append('Type something above and', document.createElement('br'), "I'll hold onto it for you.");
    empty.append(sub);
    body.replaceChildren(empty);
    return;
  }

  const top = scroll?.scrollTop ?? 0;
  scroll = el('div', 'scroll');
  if (open.length === 0) {
    const card = el('div', 'alldone');
    const text = el('div');
    text.append(el('div', 'title', 'All done!'), el('div', 'sub', 'All systems go. MoM is proud of you.'));
    card.append(el('div', 'icon', '🎉'), text);
    scroll.append(card);
  }
  for (const t of open) scroll.append(row(t, isNew(t.id)));
  if (done.length) {
    const head = el('div', 'done-head');
    const clear = el('button', null, 'Clear');
    clear.addEventListener('click', () => send('task:clear'));
    head.append(el('span', null, `Done · ${done.length}`), clear);
    scroll.append(head);
    for (const t of done) scroll.append(row(t, isNew(t.id)));
  }
  body.replaceChildren(scroll);
  scroll.scrollTop = top;

  for (const r of scroll.querySelectorAll('.row')) {
    const was = before.get(r.dataset.id);
    if (was == null) continue;
    const dy = was - r.getBoundingClientRect().top;
    if (Math.abs(dy) > 0.5) {
      r.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 420, easing: 'cubic-bezier(0.3, 1.25, 0.5, 1)' });
    }
  }
}

// MARK: Updates

function notesList(notes) {
  const ul = el('ul', 'u-notes');
  for (const n of notes) ul.append(el('li', null, n));
  return ul;
}

function closeButton(title, onClick) {
  const b = el('button', 'u-close');
  b.title = title;
  b.innerHTML = CROSS;
  b.addEventListener('click', onClick);
  return b;
}

/** The card above the list: a new version with what's in it, or what changed after an update. */
function renderUpdate() {
  const box = $('update');
  const u = update;
  if (u?.whatsNew) {
    const { version, notes } = u.whatsNew;
    const head = el('div', 'u-head');
    const text = el('div', 'u-text');
    text.append(el('div', 'u-title', `Updated to ${version} ✨`),
      el('div', 'u-sub', notes.length ? "Here's what's new:" : 'Thanks for keeping MoM up to date.'));
    head.append(text, closeButton('Close', () => send('update:seen')));
    box.replaceChildren(head);
    if (notes.length) box.append(notesList(notes));
    box.hidden = false;
    return;
  }
  if (!u || u.status === 'none' || u.snoozed) {
    box.hidden = true;
    return;
  }

  const head = el('div', 'u-head');
  const text = el('div', 'u-text');
  text.append(el('div', 'u-title', `🎁 MoM ${u.version} is here`),
    el('div', 'u-sub', u.notes.length ? "What's new:" : 'A new version of MoM is ready.'));
  head.append(text);
  if (u.status !== 'installing') head.append(closeButton('Remind me tomorrow', () => send('update:later')));
  box.replaceChildren(head);
  if (u.notes.length) box.append(notesList(u.notes));
  if (u.message) box.append(el('div', 'u-message', u.message));

  const percent = `${Math.round((u.progress ?? 0) * 100)}%`;
  const [label, enabled] =
    u.status === 'installing' ? ['Updating…', false]
    : u.status === 'downloading' ? [`Downloading… ${percent}`, false]
    : u.action === 'download' ? ['Download', true]
    : u.status === 'ready' ? ['Restart to update', true]
    : ['Update now', true];
  const actions = el('div', 'u-actions');
  const go = el('button', 'u-go', label);
  go.disabled = !enabled;
  go.addEventListener('click', () => send('update:install'));
  actions.append(go);
  if (u.status !== 'installing' && u.status !== 'downloading') {
    const later = el('button', 'u-later', 'Later');
    later.addEventListener('click', () => send('update:later'));
    actions.append(later);
  }
  box.append(actions);
  box.hidden = false;
}

// MARK: Undo

function showToast(text) {
  $('toast-text').textContent = text;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, 6000);
}

function hideToast() {
  clearTimeout(toastTimer);
  $('toast').hidden = true;
}

function undo() {
  hideToast();
  send('task:undo');
}

$('undo').addEventListener('click', undo);

// MARK: Input

draft.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && draft.value.trim()) {
    send('task:add', draft.value);
    draft.value = '';
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') send('panel:hide');
  // Cmd+Z / Ctrl+Z brings back a deleted task, unless it's undoing typing in a text box.
  const typing = document.activeElement?.tagName === 'INPUT' && document.activeElement.value;
  if (e.key.toLowerCase() === 'z' && (e.metaKey || e.ctrlKey) && !e.shiftKey && !typing) {
    e.preventDefault();
    undo();
  }
});

on('tasks', (list) => {
  tasks = list;
  render();
});

on('undoable', showToast);

on('update', (u) => {
  update = u;
  renderUpdate();
});

on('show', () => {
  card.classList.remove('appear');
  void card.offsetWidth;
  card.classList.add('appear');
  draft.focus();
});

({ tasks, update } = await invoke('panel:hello'));
render();
renderUpdate();
