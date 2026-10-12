const { send, invoke, on } = window.mom;

const $ = (id) => document.getElementById(id);
const card = $('card');
const draft = $('draft');
const body = $('body');

let tasks = [];
let editing = null;      // id of the task being renamed
let known = null;        // ids already on screen, so new rows can slide in
let scroll = null;

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

// MARK: Input

draft.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && draft.value.trim()) {
    send('task:add', draft.value);
    draft.value = '';
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') send('panel:hide');
});

on('tasks', (list) => {
  tasks = list;
  render();
});

on('show', () => {
  card.classList.remove('appear');
  void card.offsetWidth;
  card.classList.add('appear');
  draft.focus();
});

tasks = await invoke('panel:hello');
render();
