async function api(path, options) {
  const res = await fetch(path, Object.assign({ headers: { 'Content-Type': 'application/json' } }, options));
  try {
    return await res.json();
  } catch (err) {
    const txt = await res.text();
    return { error: txt || `HTTP ${res.status}` };
  }
}

const $ = id => document.getElementById(id);

function el(tag, attrs = {}, children = []) {
  const e = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => { if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v); });
  children.forEach(c => typeof c === 'string' ? e.appendChild(document.createTextNode(c)) : e.appendChild(c));
  return e;
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function renderMarkdown(md) {
  if (!md) return '';
  try {
    if (typeof marked === 'function') return marked(md);
    if (marked && typeof marked.parse === 'function') return marked.parse(md);
  } catch (e) {
    console.warn('Markdown render failed:', e);
  }
  return md;
}

function makeQuestionBlock(index) {
  const container = el('div', { class: 'question-block' });
  const qLabel = el('label', {}, [ 'Question ' + (index + 1) ]);
  const qInput = el('input', { placeholder: 'Question text', class: 'q-text' });
  const typeSelect = el('select', { class: 'q-type' });
  ['multiple','multi','matching','text'].forEach(t => {
    const opt = document.createElement('option'); opt.value = t; opt.textContent = t === 'multiple' ? 'Multiple choice' : t === 'multi' ? 'Select all that apply' : t === 'matching' ? 'Match terms' : 'Text answer';
    typeSelect.appendChild(opt);
  });

  // multiple / multi: options textarea
  const opts = el('textarea', { placeholder: 'Options (one per line)', class: 'q-opts' });
  // multiple: correct index
  const correct = el('input', { placeholder: 'Correct option index (0-based)', class: 'q-correct', type: 'number', min: 0 });
  // multi: correct indices comma separated
  const correctMulti = el('input', { placeholder: 'Correct indices (comma separated)', class: 'q-correct-multi' });
  // matching: pairs textarea left|right per line
  const pairs = el('textarea', { placeholder: 'Pairs (left|right per line)', class: 'q-pairs' });
  // text: expected answer
  const textAnswer = el('input', { placeholder: 'Expected text answer (optional)', class: 'q-text-answer' });

  const remove = el('button', { type: 'button', onclick: () => container.remove() }, [ 'Remove' ]);
  container.appendChild(qLabel);
  container.appendChild(qInput);
  container.appendChild(typeSelect);
  container.appendChild(opts);
  container.appendChild(correct);
  container.appendChild(correctMulti);
  container.appendChild(pairs);
  container.appendChild(textAnswer);
  container.appendChild(remove);

  function updateVisibility() {
    const t = typeSelect.value;
    opts.style.display = (t === 'multiple' || t === 'multi') ? '' : 'none';
    correct.style.display = t === 'multiple' ? '' : 'none';
    correctMulti.style.display = t === 'multi' ? '' : 'none';
    pairs.style.display = t === 'matching' ? '' : 'none';
    textAnswer.style.display = t === 'text' ? '' : 'none';
  }
  typeSelect.addEventListener('change', updateVisibility);
  updateVisibility();
  return container;
}

async function refreshQuizList() {
  const searchInput = $('search');
  const q = searchInput ? searchInput.value.trim() : '';
  const url = q ? '/api/quizzes?search=' + encodeURIComponent(q) : '/api/quizzes';
  const list = await api(url);
  const ul = $('quiz-list');
  if (!ul) return;
  ul.innerHTML = '';
  const current = getCurrentUser();
  // fetch users to map ids -> usernames for display
  const usersRes = await api('/api/users');
  const users = Array.isArray(usersRes) ? usersRes : [];
  const userMap = {};
  users.forEach(u => { if (u && u.id) userMap[u.id] = u.username || u.id; });
  (list || []).forEach(q => {
    const li = el('li');
    const btn = el('button', { type: 'button', onclick: () => { window.location.href = '/take.html?quiz=' + encodeURIComponent(q.id); } }, [ q.title ]);
    li.appendChild(btn);
    if (q.owner) {
      const ownerName = userMap[q.owner] || q.owner;
      const ownerText = el('span', { class: 'owner' }, [ current && current.id === q.owner ? ' (you)' : ` (${ownerName})` ]);
      li.appendChild(ownerText);
    }
    if (current && q.owner === current.id) {
      const edit = el('button', { type: 'button', onclick: () => { window.location.href = '/edit.html?edit=' + encodeURIComponent(q.id); } }, [ 'Edit' ]);
      li.appendChild(edit);
    }
    // quick rating input
    if (current && current.id !== q.owner) {
      const rateIn = el('input', { type: 'number', min: 1, max: 5, placeholder: 'Rate 1-5', class: 'quick-rate' });
      const rateBtn = el('button', { type: 'button', onclick: async () => {
        const val = parseInt(rateIn.value, 10);
        if (!val) return alert('Enter 1-5');
        await api('/api/quizzes/' + q.id + '/rate', { method: 'POST', body: JSON.stringify({ userId: current.id, rating: val }) });
        alert('Thanks for rating');
        refreshQuizList();
      } }, ['Rate']);
      li.appendChild(rateIn);
      li.appendChild(rateBtn);
    }
    ul.appendChild(li);
  });
}

function getCurrentUser() {
  try { return JSON.parse(localStorage.getItem('quiz_user')); } catch (e) { return null; }
}

function setCurrentUser(u) {
  if (u) localStorage.setItem('quiz_user', JSON.stringify(u)); else localStorage.removeItem('quiz_user');
  updateUserUI();
}

function updateUserUI() {
  const cur = getCurrentUser();
  const currentUserSpan = document.getElementById('current-user');
  const logoutBtn = document.getElementById('logout');
  const usernameInput = document.getElementById('username');
  const usernameLabel = document.getElementById('username-label');
  const passwordInput = document.getElementById('password');
  const passwordLabel = document.getElementById('password-label');
  const signupBtn = document.getElementById('signup');
  const loginBtn = document.getElementById('login');
  if (cur) {
    if (currentUserSpan) { currentUserSpan.textContent = `Signed in: ${cur.username}`; currentUserSpan.classList.remove('hidden'); }
    if (logoutBtn) logoutBtn.classList.remove('hidden');
    if (usernameInput) usernameInput.classList.add('hidden');
    if (usernameLabel) usernameLabel.classList.add('hidden');
    if (passwordInput) passwordInput.classList.add('hidden');
    if (passwordLabel) passwordLabel.classList.add('hidden');
    if (signupBtn) signupBtn.classList.add('hidden');
    if (loginBtn) loginBtn.classList.add('hidden');
  } else {
    if (currentUserSpan) currentUserSpan.classList.add('hidden');
    if (logoutBtn) logoutBtn.classList.add('hidden');
    if (usernameInput) usernameInput.classList.remove('hidden');
    if (usernameLabel) usernameLabel.classList.remove('hidden');
    if (passwordInput) passwordInput.classList.remove('hidden');
    if (passwordLabel) passwordLabel.classList.remove('hidden');
    if (signupBtn) signupBtn.classList.remove('hidden');
    if (loginBtn) loginBtn.classList.remove('hidden');
  }
  // update profile nav links to include current user id when signed in
  const profileLinks = document.querySelectorAll('#nav-profile');
  profileLinks.forEach(a => {
    if (cur && cur.id) a.href = '/profile.html?user=' + encodeURIComponent(cur.id);
    else a.href = '/profile.html';
  });
}

async function signup() {
  const u = document.getElementById('username').value.trim();
  const p = document.getElementById('password').value.trim();
  if (!u || !p) return alert('Enter username and password');
  const res = await api('/api/users/signup', { method: 'POST', body: JSON.stringify({ username: u, password: p }) });
  if (res.error) return alert(res.error);
  setCurrentUser(res);
  u.value = '';
  p.value = '';
}

async function login() {
  const u = document.getElementById('username').value.trim();
  const p = document.getElementById('password').value.trim();
  if (!u || !p) return alert('Enter username and password');
  const res = await api('/api/users/login', { method: 'POST', body: JSON.stringify({ username: u, password: p }) });
  if (res.error) return alert(res.error);
  setCurrentUser(res);
  u.value = '';
  p.value = '';
}

function logout() { setCurrentUser(null); }

let editingId = null;

async function editQuiz(id) {
  const q = await api('/api/quizzes/' + id);
  const titleEl = $('quiz-title'); if (titleEl) titleEl.value = q.title;
  const descEl = $('quiz-description'); if (descEl) descEl.value = q.description || '';
  const container = $('questions');
  container.innerHTML = '';
  q.questions.forEach((question, idx) => {
    const block = makeQuestionBlock(idx);
    block.querySelector('.q-text').value = question.text || '';
    const typeSel = block.querySelector('.q-type');
    typeSel.value = question.type || 'multiple';
    if (question.type === 'matching' && Array.isArray(question.pairs)) {
      block.querySelector('.q-pairs').value = question.pairs.map(p => `${p.left}|${p.right}`).join('\n');
    } else if (question.type === 'multi') {
      block.querySelector('.q-opts').value = (question.options || []).join('\n');
      block.querySelector('.q-correct-multi').value = (question.correct || []).join(',');
    } else if (question.type === 'text') {
      block.querySelector('.q-text-answer').value = question.answer || '';
    } else {
      block.querySelector('.q-opts').value = (question.options || []).join('\n');
      block.querySelector('.q-correct').value = question.correct != null ? question.correct : '';
    }
    // trigger visibility
    typeSel.dispatchEvent(new Event('change'));
    container.appendChild(block);
  });
  editingId = id;
  const ei = $('edit-indicator'); if (ei) ei.classList.remove('hidden');
  const eid = $('editing-id'); if (eid) eid.textContent = id;
  const saveBtn = $('save-quiz'); if (saveBtn) saveBtn.textContent = 'Update Quiz';
}

function loadQuiz(id) {
  api('/api/quizzes/' + id).then(q => {
    const takeSection = $('take-section'); if (takeSection) takeSection.classList.remove('hidden');
    const takeTitle = $('take-title');
    const takeDesc = $('take-desc');
    const form = $('take-form');
    if (!form) return;
    form.innerHTML = '';
    if (!q || q.error) {
      if (takeTitle) takeTitle.textContent = 'Quiz not found';
      if (takeDesc) takeDesc.textContent = q && q.error ? q.error : '';
      return;
    }
    if (takeTitle) takeTitle.textContent = q.title || 'Untitled Quiz';
    if (takeDesc) takeDesc.innerHTML = renderMarkdown(q.description);
    q.questions.forEach((question, qi) => {
      const qdiv = el('div', { class: 'take-question' });
      qdiv.appendChild(el('h3', {}, [ question.text ]));
      // description
      if (q.description) {
        const d = el('div', { class: 'quiz-desc' });
        d.innerHTML = renderMarkdown(q.description);
        qdiv.appendChild(d);
      }
      const type = question.type || 'multiple';
      if (type === 'multiple') {
        (question.options || []).forEach((opt, oi) => {
          const id = `q${qi}o${oi}`;
          const radio = el('input', { type: 'radio', name: 'q' + qi, value: oi, id });
          const label = el('label', { for: id }, [ opt ]);
          qdiv.appendChild(radio);
          qdiv.appendChild(label);
          qdiv.appendChild(el('br'));
        });
      } else if (type === 'multi') {
        (question.options || []).forEach((opt, oi) => {
          const id = `q${qi}o${oi}`;
          const cb = el('input', { type: 'checkbox', name: 'q' + qi, value: oi, id });
          const label = el('label', { for: id }, [ opt ]);
          qdiv.appendChild(cb);
          qdiv.appendChild(label);
          qdiv.appendChild(el('br'));
        });
      } else if (type === 'matching') {
        const rights = (question.pairs || []).map(p => p.right);
        // randomize displayed right-side options
        const shuffled = shuffle(rights.slice());
        (question.pairs || []).forEach((p, i) => {
          const sel = el('select', { name: 'q' + qi });
          // default placeholder option
          sel.appendChild(el('option', { value: '' }, [ '{Choose}' ]));
          shuffled.forEach(r => { const o = el('option', { value: r }, [ r ]); sel.appendChild(o); });
          const row = el('div', {}, [ el('strong', {}, [ p.left ]), sel ]);
          qdiv.appendChild(row);
        });
      } else if (type === 'text') {
        const ta = el('textarea', { name: 'q' + qi, placeholder: 'Your answer' });
        qdiv.appendChild(ta);
      }
      form.appendChild(qdiv);
    });
    const submitBtn = $('submit-answers');
    if (submitBtn) submitBtn.onclick = async () => {
      const answers = [];
      q.questions.forEach((question, qi) => {
        const type = question.type || 'multiple';
        if (type === 'multiple') {
          const val = form.querySelector('input[name="q' + qi + '"]:checked');
          answers.push(val ? parseInt(val.value, 10) : null);
        } else if (type === 'multi') {
          const vals = Array.from(form.querySelectorAll('input[name="q' + qi + '"]:checked')).map(n => parseInt(n.value, 10));
          answers.push(vals);
        } else if (type === 'matching') {
          const sels = Array.from(form.querySelectorAll('select[name="q' + qi + '"]')).map(s => s.value);
          answers.push(sels);
        } else if (type === 'text') {
          const ta = form.querySelector('textarea[name="q' + qi + '"]');
          answers.push(ta ? ta.value : '');
        }
      });
      const user = getCurrentUser();
      const res = await api('/api/quizzes/' + id + '/submit', { method: 'POST', body: JSON.stringify({ answers, userId: user ? user.id : null }) });
      const resultEl = $('result'); if (resultEl) resultEl.textContent = `Score: ${res.score}% (${res.correct}/${res.total})`;
      // rating UI
      const ratingBox = el('div', {});
      const ratingInput = el('input', { type: 'number', min: 1, max: 5, placeholder: 'Rate 1-5' });
      const review = el('textarea', { placeholder: 'Leave a review (optional)' });
      const submitRating = el('button', { type: 'button', onclick: async () => {
        const val = parseInt(ratingInput.value, 10);
        await api('/api/quizzes/' + id + '/rate', { method: 'POST', body: JSON.stringify({ userId: user ? user.id : null, rating: val, review: review.value }) });
        alert('Thanks for rating');
      } }, ['Submit Rating']);
      ratingBox.appendChild(ratingInput);
      ratingBox.appendChild(review);
      ratingBox.appendChild(submitRating);
      form.appendChild(ratingBox);
    };
  });
}

const addQuestionBtn = $('add-question'); if (addQuestionBtn) addQuestionBtn.addEventListener('click', () => {
  const container = $('questions'); if (container) container.appendChild(makeQuestionBlock(container.children.length));
});

const saveQuizBtn = $('save-quiz'); if (saveQuizBtn) saveQuizBtn.addEventListener('click', async () => {
  const title = document.getElementById('quiz-title').value.trim();
  const desc = document.getElementById('quiz-description') ? document.getElementById('quiz-description').value : '';
  const blocks = Array.from(document.querySelectorAll('.question-block'));
  const questions = blocks.map(b => {
    const text = b.querySelector('.q-text').value.trim();
    const type = b.querySelector('.q-type').value;
    if (type === 'matching') {
      const raw = b.querySelector('.q-pairs').value.split('\n').map(s => s.trim()).filter(Boolean);
      const pairs = raw.map(line => {
        const parts = line.split('|');
        return { left: parts[0].trim(), right: (parts[1] || '').trim() };
      });
      return { type: 'matching', text, pairs };
    } else if (type === 'multi') {
      const opts = b.querySelector('.q-opts').value.split('\n').map(s => s.trim()).filter(Boolean);
      const correctRaw = b.querySelector('.q-correct-multi').value.split(',').map(s => s.trim()).filter(Boolean);
      const correct = correctRaw.map(n => parseInt(n, 10)).filter(n => Number.isFinite(n));
      return { type: 'multi', text, options: opts, correct };
    } else if (type === 'text') {
      const answer = b.querySelector('.q-text-answer').value.trim();
      return { type: 'text', text, answer };
    } else {
      const opts = b.querySelector('.q-opts').value.split('\n').map(s => s.trim()).filter(Boolean);
      const correct = parseInt(b.querySelector('.q-correct').value, 10);
      return { type: 'multiple', text, options: opts, correct: Number.isFinite(correct) ? correct : 0 };
    }
  });
  if (!title || questions.length === 0) { alert('Add a title and at least one question'); return; }
  const user = getCurrentUser();
  if (editingId) {
    const res = await api('/api/quizzes/' + editingId, { method: 'PUT', body: JSON.stringify({ title, questions, owner: user ? user.id : null, description: desc }) });
    if (res && res.error) { alert(res.error); return; }
    editingId = null;
    const ei = $('edit-indicator'); if (ei) ei.classList.add('hidden');
    const saveBtn2 = $('save-quiz'); if (saveBtn2) saveBtn2.textContent = 'Save Quiz';
  } else {
    await api('/api/quizzes', { method: 'POST', body: JSON.stringify({ title, questions, owner: user ? user.id : null, description: desc }) });
  }
  document.getElementById('quiz-title').value = '';
  document.getElementById('questions').innerHTML = '';
  refreshQuizList();
});

// init
refreshQuizList();

// auth bindings
const signupBtn = $('signup'); if (signupBtn) signupBtn.addEventListener('click', signup);
const loginBtn = $('login'); if (loginBtn) loginBtn.addEventListener('click', login);
const logoutBtn = $('logout'); if (logoutBtn) logoutBtn.addEventListener('click', logout);

// export/import
const exportBtn = $('export-quizzes'); if (exportBtn) exportBtn.addEventListener('click', async () => {
  const res = await fetch('/api/export');
  const text = await res.text();
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'quizzes-export.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});
const importFile = $('import-file'); if (importFile) importFile.addEventListener('change', async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  const txt = await f.text();
  try {
    const parsed = JSON.parse(txt);
    // accept either array or { quizzes: [] }
    const quizzes = Array.isArray(parsed) ? parsed : (parsed.quizzes || []);
    if (!Array.isArray(quizzes)) return alert('Invalid file');
    const res = await api('/api/import', { method: 'POST', body: JSON.stringify({ quizzes }) });
    alert(`Imported ${res.added || 0} quizzes`);
    refreshQuizList();
  } catch (err) { alert('Invalid JSON file'); }
});

// search
const searchBtn = $('search-btn'); if (searchBtn) searchBtn.addEventListener('click', () => refreshQuizList());

// theme toggle
const themeToggle = $('theme-toggle'); if (themeToggle) themeToggle.addEventListener('click', () => {
  const isDark = document.body.classList.toggle('dark');
  localStorage.setItem('quiz_theme', isDark ? 'dark' : 'light');
});
// apply saved theme
if (localStorage.getItem('quiz_theme') === 'dark') document.body.classList.add('dark');

// profile page init: upload avatar, load user quizzes and results
async function initProfilePage() {
  const params = new URLSearchParams(window.location.search);
  const userParam = params.get('user');
  const cur = getCurrentUser();
  let userId = null;
  if (userParam) userId = userParam; else if (cur) userId = cur.id; else return;
  const profile = await api('/api/users/' + userId + '/profile');
  const users = await api('/api/users');
  const userObj = Array.isArray(users) ? users.find(u => u.id === userId) : null;
  const uname = $('profile-username'); if (uname) uname.textContent = userObj ? userObj.username : (profile.username || 'User');
  const avg = $('profile-avg'); if (avg) avg.textContent = profile.averageScore || 0;
  const cnt = $('profile-count'); if (cnt) cnt.textContent = profile.quizCount || 0;
  const avatarImg = $('profile-avatar'); if (avatarImg) {
    // set fallback in case avatar URL is broken
    avatarImg.onerror = () => { avatarImg.src = 'default-avatar.png'; };
    // prefer avatar from users list, fall back to profile response
    let avatarPath = null;
    if (userObj && userObj.avatar) avatarPath = userObj.avatar;
    else if (profile && profile.avatar) avatarPath = profile.avatar;
    if (avatarPath) {
      let url = avatarPath;
      if (!url.startsWith('/')) url = '/' + url;
      avatarImg.src = url;
    } else {
      console.warn('No avatar found for user', userId);
    }
  }
  const quizzes = await api('/api/users/' + userId + '/quizzes');
  const uq = $('user-quizzes'); if (uq) {
    uq.innerHTML = '';
    quizzes.forEach(q => {
      const li = el('li');
      const a = el('a', { href: '/take.html?quiz=' + encodeURIComponent(q.id) }, [ q.title ]);
      li.appendChild(a);
      // if viewing own profile, show edit button for each quiz
      if (cur && cur.id === userId) {
        const editBtn = el('button', { type: 'button', onclick: () => { window.location.href = '/edit.html?edit=' + encodeURIComponent(q.id); } }, [ 'Edit' ]);
        li.appendChild(editBtn);
      }
      uq.appendChild(li);
    });
  }
  const ur = $('user-results');
  if (ur) {
    // only show results when the signed-in user is viewing their own profile
    if (!cur || cur.id !== userId) {
      ur.innerHTML = '<li>Results are private</li>';
    } else {
      const results = await api('/api/users/' + userId + '/results');
      ur.innerHTML = '';
      results.forEach(r => {
        const li = el('li', {}, [ `Quiz ${r.quizId}: ${r.score}% on ${new Date(r.timestamp).toLocaleString()}` ]);
        ur.appendChild(li);
      });
    }
  }

  const uploadForm = $('avatar-form');
  if (!cur || cur.id !== userId) {
    if (uploadForm) uploadForm.style.display = 'none';
  } else {
    const uploadBtn = $('upload-avatar'); if (uploadBtn) uploadBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      const fileInput = $('avatar-file'); if (!fileInput || !fileInput.files[0]) return alert('Choose a file');
      const fd = new FormData(); fd.append('avatar', fileInput.files[0]);
      const res = await fetch('/api/users/' + userId + '/avatar', { method: 'POST', body: fd });
      const data = await res.json();
      if (data.avatar) { const avatarImg2 = $('profile-avatar'); if (avatarImg2) { let url = data.avatar; if (!url.startsWith('/')) url = '/' + url; avatarImg2.src = url; } alert('Uploaded'); }
    });
  }
}

// run profile init if page present
if ($('profile-page')) initProfilePage();

// if create page and an editing id was passed via query or localStorage, load it
const isCreatePage = window.location.pathname.endsWith('/create.html') || window.location.pathname === '/create.html';
const isEditPage = window.location.pathname.endsWith('/edit.html') || window.location.pathname === '/edit.html';
if (isCreatePage || isEditPage) {
  const params = new URLSearchParams(window.location.search);
  const editId = params.get('edit');
  if (editId) {
    // small timeout to allow create/edit page DOM to be ready
    setTimeout(() => editQuiz(editId), 150);
  }
}

const isTakePage = window.location.pathname.endsWith('/take.html') || window.location.pathname === '/take.html';
if (isTakePage) {
  const params = new URLSearchParams(window.location.search);
  const quizId = params.get('quiz') || params.get('id');
  if (quizId) setTimeout(() => loadQuiz(quizId), 150);
}

async function initEditPage() {
  if (!isEditPage) return;
  const select = $('edit-select');
  const newBtn = $('new-quiz');
  const cur = getCurrentUser();
  if (!select) return;
  select.innerHTML = '<option value="">-- Select --</option>';
  if (!cur) {
    const opt = document.createElement('option'); opt.value = ''; opt.textContent = 'Sign in to edit'; select.appendChild(opt); select.disabled = true; return;
  }
  const quizzes = await api('/api/users/' + cur.id + '/quizzes');
  quizzes.forEach(q => {
    const o = document.createElement('option'); o.value = q.id; o.textContent = q.title; select.appendChild(o);
  });
  select.addEventListener('change', () => {
    const id = select.value;
    if (id) editQuiz(id);
  });
  if (newBtn) newBtn.addEventListener('click', (e) => {
    e.preventDefault();
    // clear form for new quiz
    editingId = null;
    const ei = $('edit-indicator'); if (ei) ei.classList.add('hidden');
    const title = $('quiz-title'); if (title) title.value = '';
    const desc = $('quiz-description'); if (desc) desc.value = '';
    const questions = $('questions'); if (questions) questions.innerHTML = '';
    const save = $('save-quiz'); if (save) save.textContent = 'Save Quiz';
  });
  // if an edit id is present in URL, select it
  const params = new URLSearchParams(window.location.search);
  const editId = params.get('edit');
  if (editId) {
    // set select value when options are ready
    setTimeout(() => { select.value = editId; if (select.value) editQuiz(editId); }, 100);
  }
}

// initialize edit page select if present
initEditPage();

updateUserUI();
