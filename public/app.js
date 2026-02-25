async function api(path, options) {
  const current = getCurrentUser();
  const token = current && current.token ? current.token : null;
  const baseHeaders = { 'Content-Type': 'application/json' };
  if (token) baseHeaders.Authorization = 'Bearer ' + token;
  const mergedOptions = Object.assign({ headers: baseHeaders }, options || {});
  mergedOptions.headers = Object.assign({}, baseHeaders, (options && options.headers) ? options.headers : {});
  const res = await fetch(path, mergedOptions);
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

function renumberQuestionBlocks() {
  const blocks = Array.from(document.querySelectorAll('.question-block'));
  blocks.forEach((block, idx) => {
    const label = block.querySelector('.q-label');
    if (label) label.textContent = 'Question ' + (idx + 1);
  });
}

function extractQuestionDraft(block) {
  const text = block.querySelector('.q-text').value.trim();
  const description = block.querySelector('.q-desc').value.trim();
  const type = block.querySelector('.q-type').value;
  const options = Array.from(block.querySelectorAll('.q-option-input')).map(i => i.value.trim()).filter(Boolean);
  let correct = null;
  let correctMulti = [];
  if (type === 'multiple') {
    const selected = block.querySelector('input.q-correct-choice-single:checked');
    correct = selected ? parseInt(selected.value, 10) : null;
  } else if (type === 'multi') {
    correctMulti = Array.from(block.querySelectorAll('input.q-correct-choice-multi:checked'))
      .map(n => parseInt(n.value, 10))
      .filter(n => Number.isFinite(n));
  }
  const pairs = Array.from(block.querySelectorAll('.q-pair-row')).map(row => ({
    left: (row.querySelector('.q-pair-left') ? row.querySelector('.q-pair-left').value : '').trim(),
    right: (row.querySelector('.q-pair-right') ? row.querySelector('.q-pair-right').value : '').trim()
  })).filter(p => p.left || p.right);
  const answers = Array.from(block.querySelectorAll('.q-answer-input')).map(i => i.value.trim()).filter(Boolean);

  return {
    type,
    text,
    description,
    options,
    correct: Number.isFinite(correct) ? correct : null,
    correctMulti,
    pairs,
    answers
  };
}

function validateQuestionDraft(draft, questionNumber) {
  const errors = [];
  if (!draft.text) errors.push(`Question ${questionNumber}: question text is required.`);

  if (draft.type === 'multiple') {
    if (draft.options.length < 2) errors.push(`Question ${questionNumber}: add at least 2 options.`);
    if (!Number.isFinite(draft.correct)) {
      errors.push(`Question ${questionNumber}: set the correct option number.`);
    } else if (draft.correct < 0 || draft.correct >= draft.options.length) {
      errors.push(`Question ${questionNumber}: correct option number must be between 1 and ${Math.max(1, draft.options.length)}.`);
    }
  } else if (draft.type === 'multi') {
    if (draft.options.length < 2) errors.push(`Question ${questionNumber}: add at least 2 options.`);
    if (draft.correctMulti.length === 0) errors.push(`Question ${questionNumber}: add at least one correct option number.`);
    const invalid = draft.correctMulti.find(i => i < 0 || i >= draft.options.length);
    if (invalid != null) errors.push(`Question ${questionNumber}: option number ${invalid + 1} is out of range.`);
  } else if (draft.type === 'matching') {
    if (draft.pairs.length === 0) errors.push(`Question ${questionNumber}: add at least one pair.`);
    const incomplete = draft.pairs.find(p => !p.left || !p.right);
    if (incomplete) errors.push(`Question ${questionNumber}: each pair must include both left and right values.`);
  } else if (draft.type === 'text') {
    if (!draft.answers || draft.answers.length === 0) errors.push(`Question ${questionNumber}: add at least one correct answer.`);
  } else if (draft.type === 'number') {
    if (!draft.answers || draft.answers.length === 0) {
      errors.push(`Question ${questionNumber}: add at least one correct number.`);
    } else {
      const invalid = draft.answers.find(value => !Number.isFinite(parseFloat(value)));
      if (invalid != null) errors.push(`Question ${questionNumber}: all correct answers must be valid numbers.`);
    }
  }

  return errors;
}

function draftToQuestion(draft) {
  if (draft.type === 'matching') {
    return { type: 'matching', text: draft.text, description: draft.description, pairs: draft.pairs };
  }
  if (draft.type === 'multi') {
    return { type: 'multi', text: draft.text, description: draft.description, options: draft.options, correct: draft.correctMulti };
  }
  if (draft.type === 'text') {
    return { type: 'text', text: draft.text, description: draft.description, answer: draft.answers.length === 1 ? draft.answers[0] : draft.answers };
  }
  if (draft.type === 'number') {
    const values = (draft.answers || []).map(value => parseFloat(value)).filter(value => Number.isFinite(value));
    return { type: 'number', text: draft.text, description: draft.description, answer: values.length === 1 ? values[0] : values };
  }
  return { type: 'multiple', text: draft.text, description: draft.description, options: draft.options, correct: draft.correct };
}

function collectAndValidateQuestions(blocks) {
  const questions = [];
  const errors = [];

  blocks.forEach((block, idx) => {
    const draft = extractQuestionDraft(block);
    errors.push(...validateQuestionDraft(draft, idx + 1));
    questions.push(draftToQuestion(draft));
  });

  return { questions, errors };
}

function makeQuestionBlock(index, initialData = null) {
  const container = el('div', { class: 'question-block' });
  const header = el('div', { class: 'question-header' });
  const qLabel = el('label', { class: 'q-label' }, [ 'Question ' + (index + 1) ]);
  const actions = el('div', { class: 'question-actions' });

  const moveUp = el('button', { type: 'button', onclick: () => {
    const prev = container.previousElementSibling;
    if (!prev) return;
    container.parentNode.insertBefore(container, prev);
    renumberQuestionBlocks();
  } }, [ '↑' ]);
  const moveDown = el('button', { type: 'button', onclick: () => {
    const next = container.nextElementSibling;
    if (!next) return;
    container.parentNode.insertBefore(next, container);
    renumberQuestionBlocks();
  } }, [ '↓' ]);
  const duplicate = el('button', { type: 'button', onclick: () => {
    const draft = extractQuestionDraft(container);
    const copy = makeQuestionBlock(index + 1, draft);
    container.parentNode.insertBefore(copy, container.nextSibling);
    renumberQuestionBlocks();
  } }, [ 'Duplicate' ]);
  const remove = el('button', { type: 'button', onclick: () => {
    container.remove();
    renumberQuestionBlocks();
  } }, [ 'Remove' ]);

  actions.appendChild(moveUp);
  actions.appendChild(moveDown);
  actions.appendChild(duplicate);
  actions.appendChild(remove);
  header.appendChild(qLabel);
  header.appendChild(actions);

  const qInput = el('input', { placeholder: 'Question text', class: 'q-text' });
  const qDesc = el('textarea', { placeholder: 'Question description (Markdown supported)', class: 'q-desc' });
  const typeSelect = el('select', { class: 'q-type' });
  ['multiple','multi','matching','text','number'].forEach(t => {
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = t === 'multiple'
      ? 'Multiple choice'
      : t === 'multi'
        ? 'Select all that apply'
        : t === 'matching'
          ? 'Match terms'
          : t === 'number'
            ? 'Number answer'
            : 'Text answer';
    typeSelect.appendChild(opt);
  });

  const optionBuilder = el('div', { class: 'q-option-builder' });
  const optionsList = el('div', { class: 'q-options-list' });
  const addOptionBtn = el('button', { type: 'button' }, [ 'Add Option' ]);
  const correctChoices = el('div', { class: 'q-correct-choices' });
  // matching: interactive left/right pair builder
  const pairBuilder = el('div', { class: 'q-pair-builder' });
  const pairsList = el('div', { class: 'q-pairs-list' });
  const addPairBtn = el('button', { type: 'button' }, [ 'Add Pair' ]);
  const answerBuilder = el('div', { class: 'q-answer-builder' });
  const answersList = el('div', { class: 'q-answers-list' });
  const addAnswerBtn = el('button', { type: 'button' }, [ 'Add Correct Answer' ]);
  const addOptionsHelp = el('div', { class: 'q-help' }, [ 'Tip: click Add Option, fill each option, then select the correct answer(s) below.' ]);
  const matchingHelp = el('div', { class: 'q-help' }, [ 'Tip: add each pair using Left and Right fields below.' ]);
  const textHelp = el('div', { class: 'q-help' }, [ 'Tip: add one or more accepted answers.' ]);
  const numberHelp = el('div', { class: 'q-help' }, [ 'Tip: add one or more accepted numeric answers.' ]);

  container.appendChild(header);
  container.appendChild(qInput);
  container.appendChild(qDesc);
  container.appendChild(typeSelect);
  container.appendChild(addOptionsHelp);
  optionBuilder.appendChild(optionsList);
  optionBuilder.appendChild(addOptionBtn);
  container.appendChild(optionBuilder);
  container.appendChild(correctChoices);
  container.appendChild(matchingHelp);
  pairBuilder.appendChild(pairsList);
  pairBuilder.appendChild(addPairBtn);
  container.appendChild(pairBuilder);
  answerBuilder.appendChild(answersList);
  answerBuilder.appendChild(addAnswerBtn);
  container.appendChild(textHelp);
  container.appendChild(numberHelp);
  container.appendChild(answerBuilder);

  const choiceGroupName = 'correct-choice-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    function createPairRow(leftValue = '', rightValue = '') {
      const row = el('div', { class: 'q-pair-row' });
      const left = el('input', { class: 'q-pair-left', placeholder: 'Left item' });
      const right = el('input', { class: 'q-pair-right', placeholder: 'Right match' });
      const remove = el('button', { type: 'button', onclick: () => row.remove() }, [ 'Remove Pair' ]);
      left.value = leftValue;
      right.value = rightValue;
      row.appendChild(left);
      row.appendChild(right);
      row.appendChild(remove);
      return row;
    }

    function createOptionRow(value = '') {
      const row = el('div', { class: 'q-option-row' });
      const input = el('input', { class: 'q-option-input', placeholder: 'Option text' });
      const remove = el('button', { type: 'button', onclick: () => {
        row.remove();
        renderCorrectChoices();
      } }, [ 'Remove Option' ]);
      input.value = value;
      input.addEventListener('input', renderCorrectChoices);
      row.appendChild(input);
      row.appendChild(remove);
      return row;
    }

    function addOptionRow(value = '') {
      optionsList.appendChild(createOptionRow(value));
      renderCorrectChoices();
    }

    function createAnswerRow(value = '') {
      const row = el('div', { class: 'q-answer-row' });
      const input = el('input', { class: 'q-answer-input', placeholder: 'Accepted answer' });
      const remove = el('button', { type: 'button', onclick: () => row.remove() }, [ 'Remove Answer' ]);
      input.value = value;
      row.appendChild(input);
      row.appendChild(remove);
      return row;
    }

    function addAnswerRow(value = '') {
      answersList.appendChild(createAnswerRow(value));
    }

    function addPairRow(leftValue = '', rightValue = '') {
      pairsList.appendChild(createPairRow(leftValue, rightValue));
    }

    addOptionBtn.addEventListener('click', () => addOptionRow());
    addPairBtn.addEventListener('click', () => addPairRow());
    addAnswerBtn.addEventListener('click', () => addAnswerRow());

  let initialCorrectSingle = null;
  let initialCorrectMulti = [];

  function getSelectedFromUI() {
    const t = typeSelect.value;
    if (t === 'multiple') {
      const selected = correctChoices.querySelector('input.q-correct-choice-single:checked');
      return {
        single: selected ? parseInt(selected.value, 10) : null,
        multi: []
      };
    }
    if (t === 'multi') {
      const selected = Array.from(correctChoices.querySelectorAll('input.q-correct-choice-multi:checked'))
        .map(n => parseInt(n.value, 10))
        .filter(n => Number.isFinite(n));
      return { single: null, multi: selected };
    }
    return { single: null, multi: [] };
  }

  function renderCorrectChoices() {
    const t = typeSelect.value;
    const optionLines = Array.from(optionsList.querySelectorAll('.q-option-input')).map(i => i.value.trim()).filter(Boolean);

    const existing = getSelectedFromUI();
    const selectedSingle = initialCorrectSingle != null ? initialCorrectSingle : existing.single;
    const selectedMulti = initialCorrectMulti.length ? initialCorrectMulti.slice() : existing.multi;

    correctChoices.innerHTML = '';
    if (t !== 'multiple' && t !== 'multi') return;

    const title = el('div', { class: 'q-help' }, [ t === 'multiple' ? 'Select the one correct answer:' : 'Select all correct answers:' ]);
    correctChoices.appendChild(title);

    if (optionLines.length === 0) {
      correctChoices.appendChild(el('div', { class: 'q-help' }, [ 'Add options above to choose correct answer(s).' ]));
      initialCorrectSingle = null;
      initialCorrectMulti = [];
      return;
    }

    optionLines.forEach((optText, idx) => {
      const row = el('label', { class: 'q-correct-row' });
      if (t === 'multiple') {
        const input = el('input', {
          type: 'radio',
          class: 'q-correct-choice-single',
          name: choiceGroupName,
          value: idx
        });
        if (selectedSingle === idx) input.checked = true;
        row.appendChild(input);
      } else {
        const input = el('input', {
          type: 'checkbox',
          class: 'q-correct-choice-multi',
          value: idx
        });
        if (selectedMulti.includes(idx)) input.checked = true;
        row.appendChild(input);
      }
      row.appendChild(el('span', {}, [ `${idx + 1}. ${optText}` ]));
      correctChoices.appendChild(row);
    });

    initialCorrectSingle = null;
    initialCorrectMulti = [];
  }

  function updateVisibility() {
    const t = typeSelect.value;
    optionBuilder.style.display = (t === 'multiple' || t === 'multi') ? '' : 'none';
    correctChoices.style.display = (t === 'multiple' || t === 'multi') ? '' : 'none';
    addOptionsHelp.style.display = (t === 'multiple' || t === 'multi') ? '' : 'none';
    pairBuilder.style.display = t === 'matching' ? '' : 'none';
    matchingHelp.style.display = t === 'matching' ? '' : 'none';
    textHelp.style.display = t === 'text' ? '' : 'none';
    numberHelp.style.display = t === 'number' ? '' : 'none';
    answerBuilder.style.display = (t === 'text' || t === 'number') ? '' : 'none';
    if ((t === 'multiple' || t === 'multi') && optionsList.children.length === 0) addOptionRow();
    if (t === 'matching' && pairsList.children.length === 0) addPairRow();
    if ((t === 'text' || t === 'number') && answersList.children.length === 0) addAnswerRow();
    renderCorrectChoices();
  }
  typeSelect.addEventListener('change', updateVisibility);

  if (initialData) {
    qInput.value = initialData.text || '';
    qDesc.value = initialData.description || '';
    typeSelect.value = initialData.type || 'multiple';
    if (initialData.type === 'matching') {
      (initialData.pairs || []).forEach(p => addPairRow(p.left || '', p.right || ''));
    } else if (initialData.type === 'multi') {
      (initialData.options || []).forEach(opt => addOptionRow(opt));
      initialCorrectMulti = Array.isArray(initialData.correct) ? initialData.correct.slice() : [];
    } else if (initialData.type === 'text' || initialData.type === 'number') {
      const initialAnswers = Array.isArray(initialData.answer) ? initialData.answer : [initialData.answer || ''];
      initialAnswers.filter(Boolean).forEach(ans => addAnswerRow(ans));
    } else {
      (initialData.options || []).forEach(opt => addOptionRow(opt));
      initialCorrectSingle = initialData.correct != null ? initialData.correct : null;
    }
  }

  updateVisibility();
  return container;
}

function addQuestionBlock(initialData = null) {
  const container = $('questions');
  if (!container) return;
  const block = makeQuestionBlock(container.children.length, initialData);
  container.appendChild(block);
  renumberQuestionBlocks();
  const textInput = block.querySelector('.q-text');
  if (textInput) textInput.focus();
}

function applyQuizToEditor(quiz) {
  if (!quiz || typeof quiz !== 'object') return;
  const title = $('quiz-title');
  const desc = $('quiz-description');
  const showResults = $('show-question-results');
  const showAnswers = $('show-correct-answers');
  const questionsContainer = $('questions');
  if (!questionsContainer) return;

  if (title) title.value = quiz.title || '';
  if (desc) desc.value = quiz.description || '';
  if (showResults) showResults.checked = !!quiz.showQuestionResults;
  if (showAnswers) showAnswers.checked = !!quiz.showCorrectAnswersForIncorrect;

  questionsContainer.innerHTML = '';
  const questions = Array.isArray(quiz.questions) ? quiz.questions : [];
  questions.forEach(q => addQuestionBlock(q));
  if (questions.length === 0) addQuestionBlock();
}

function pickQuizFromJsonPayload(payload) {
  if (!payload) return null;
  if (Array.isArray(payload)) return payload.length ? payload[0] : null;
  if (Array.isArray(payload.quizzes)) return payload.quizzes.length ? payload.quizzes[0] : null;
  if (payload.quiz && typeof payload.quiz === 'object') return payload.quiz;
  if (payload.questions && Array.isArray(payload.questions)) return payload;
  return null;
}

function normalizeImportedQuiz(quiz) {
  const base = quiz && typeof quiz === 'object' ? quiz : {};
  return {
    title: (base.title || 'Imported Quiz').toString(),
    description: base.description || '',
    showQuestionResults: !!base.showQuestionResults,
    showCorrectAnswersForIncorrect: !!base.showCorrectAnswersForIncorrect,
    questions: Array.isArray(base.questions) ? base.questions : []
  };
}

function initAiQuizGenerator() {
  if (!window.AIQuiz || typeof window.AIQuiz.initAiQuizGenerator !== 'function') return;
  window.AIQuiz.initAiQuizGenerator(applyQuizToEditor, {
    getUserSettings: () => {
      const cur = getCurrentUser();
      return readUserSettings(cur ? cur.id : null);
    }
  });
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
    const btn = el('button', { type: 'button', onclick: () => { window.location.href = '/share/' + encodeURIComponent(q.id); } }, [ q.title ]);
    li.appendChild(btn);
    if (q.owner) {
      const ownerName = userMap[q.owner] || q.owner;
      if (current && current.id === q.owner) {
        const ownerWrap = el('span', { class: 'owner' }, [ ' (' ]);
        const ownerLink = el('a', { href: '/profile.html?user=' + encodeURIComponent(q.owner) }, [ 'you' ]);
        ownerWrap.appendChild(ownerLink);
        ownerWrap.appendChild(document.createTextNode(')'));
        li.appendChild(ownerWrap);
      } else {
        const ownerWrap = el('span', { class: 'owner' }, [ ' (' ]);
        const ownerLink = el('a', { href: '/profile.html?user=' + encodeURIComponent(q.owner) }, [ ownerName ]);
        ownerWrap.appendChild(ownerLink);
        ownerWrap.appendChild(document.createTextNode(')'));
        li.appendChild(ownerWrap);
      }
    }
    if (current && q.owner === current.id) {
      const edit = el('button', { type: 'button', onclick: () => { window.location.href = '/edit.html?edit=' + encodeURIComponent(q.id); } }, [ 'Edit' ]);
      li.appendChild(edit);
    }
    ul.appendChild(li);
  });
}

function getCurrentUser() {
  try {
    const user = JSON.parse(localStorage.getItem('quiz_user'));
    if (!user || !user.id || !user.token) return null;
    return user;
  } catch (e) {
    return null;
  }
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

function getUserSettingsStorageKey(userId) {
  return 'quiz_settings_' + (userId || 'guest');
}

function getDefaultUserSettings() {
  return {
    aiProvider: 'local',
    openaiModel: 'gpt-4.1-mini',
    openaiApiKey: '',
    reviewGeneratedQuestions: true,
    defaultDifficulty: 'medium',
    defaultQuestionCount: 8
  };
}

function readUserSettings(userId) {
  const defaults = getDefaultUserSettings();
  try {
    const raw = localStorage.getItem(getUserSettingsStorageKey(userId));
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    return Object.assign({}, defaults, parsed || {});
  } catch (err) {
    return defaults;
  }
}

function writeUserSettings(userId, settings) {
  const merged = Object.assign({}, getDefaultUserSettings(), settings || {});
  localStorage.setItem(getUserSettingsStorageKey(userId), JSON.stringify(merged));
  return merged;
}

async function fetchRolesForUser(userId) {
  if (!userId) return [];
  const profile = await api('/api/users/' + userId + '/profile');
  if (!profile || profile.error || !Array.isArray(profile.roles)) return [];
  return profile.roles.map(r => String(r).toLowerCase());
}

let editingId = null;

async function editQuiz(id) {
  const q = await api('/api/quizzes/' + id + '/edit');
  if (!q || q.error) {
    alert(q && q.error ? q.error : 'Unable to load quiz for editing');
    return;
  }
  const titleEl = $('quiz-title'); if (titleEl) titleEl.value = q.title;
  const descEl = $('quiz-description'); if (descEl) descEl.value = q.description || '';
  const showQuestionResultsEl = $('show-question-results'); if (showQuestionResultsEl) showQuestionResultsEl.checked = !!q.showQuestionResults;
  const showCorrectAnswersEl = $('show-correct-answers'); if (showCorrectAnswersEl) showCorrectAnswersEl.checked = !!q.showCorrectAnswersForIncorrect;
  const container = $('questions');
  container.innerHTML = '';
  q.questions.forEach(question => addQuestionBlock(question));
  editingId = id;
  const ei = $('edit-indicator'); if (ei) ei.classList.remove('hidden');
  const eid = $('editing-id'); if (eid) eid.textContent = id;
  const saveBtn = $('save-quiz'); if (saveBtn) saveBtn.textContent = 'Update Quiz';
}

function loadQuiz(id) {
  api('/api/quizzes/' + id).then(async q => {
    const takeSection = $('take-section'); if (takeSection) takeSection.classList.remove('hidden');
    const takeTitle = $('take-title');
    const takeAuthor = $('take-author');
    const takeDesc = $('take-desc');
    const form = $('take-form');
    const feedbackHost = $('submission-feedback');
    const downloadBtn = $('download-quiz-btn');
    const shareBtn = $('share-quiz-btn');
    const moderatorDeleteBtn = $('moderator-delete-quiz-btn');
    if (!form) return;
    form.innerHTML = '';
    if (feedbackHost) feedbackHost.innerHTML = '';
    if (takeAuthor) takeAuthor.innerHTML = '';
    if (downloadBtn) downloadBtn.onclick = null;
    if (shareBtn) shareBtn.onclick = null;
    if (moderatorDeleteBtn) {
      moderatorDeleteBtn.classList.add('hidden');
      moderatorDeleteBtn.onclick = null;
    }
    if (!q || q.error) {
      if (takeTitle) takeTitle.textContent = 'Quiz not found';
      if (takeDesc) takeDesc.textContent = q && q.error ? q.error : '';
      return;
    }
    if (takeTitle) takeTitle.textContent = q.title || 'Untitled Quiz';
    if (takeDesc) takeDesc.innerHTML = renderMarkdown(q.description);

    if (downloadBtn) {
      downloadBtn.onclick = () => {
        const exportPayload = {
          id: q.id,
          title: q.title,
          description: q.description || '',
          owner: q.owner || null,
          showQuestionResults: !!q.showQuestionResults,
          showCorrectAnswersForIncorrect: !!q.showCorrectAnswersForIncorrect,
          questions: Array.isArray(q.questions) ? q.questions : []
        };
        const text = JSON.stringify(exportPayload, null, 2);
        const blob = new Blob([text], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const safeName = (q.title || 'quiz').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'quiz';
        a.href = url;
        a.download = safeName + '.json';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      };
    }

    if (shareBtn) {
      shareBtn.onclick = async () => {
        const shareUrl = window.location.origin + '/share/' + encodeURIComponent(q.id);
        const shareData = {
          title: q.title || 'Quiz',
          text: 'Try this quiz!',
          url: shareUrl
        };
        try {
          if (navigator.share) {
            await navigator.share(shareData);
            return;
          }
        } catch (err) {}

        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(shareUrl);
            alert('Share link copied to clipboard');
            return;
          }
        } catch (err) {}

        prompt('Copy this share link:', shareUrl);
      };
    }

    const currentUser = getCurrentUser();
    if (moderatorDeleteBtn && currentUser && currentUser.id) {
      const currentRoles = await fetchRolesForUser(currentUser.id);
      const isModerator = currentRoles.includes('moderator');
      if (isModerator) {
        moderatorDeleteBtn.classList.remove('hidden');
        moderatorDeleteBtn.onclick = async () => {
          if (!confirm('Delete this quiz permanently?')) return;
          const delRes = await api('/api/quizzes/' + id, { method: 'DELETE' });
          if (delRes && delRes.error) return alert(delRes.error);
          alert('Quiz deleted');
          window.location.href = '/';
        };
      }
    }

    if (takeAuthor) {
      if (q.owner) {
        api('/api/users').then(usersRes => {
          const users = Array.isArray(usersRes) ? usersRes : [];
          const ownerUser = users.find(u => u && u.id === q.owner);
          const ownerName = ownerUser ? ownerUser.username : q.owner;
          takeAuthor.innerHTML = '';
          takeAuthor.appendChild(el('span', {}, ['Author: ']));
          takeAuthor.appendChild(el('a', { href: '/profile.html?user=' + encodeURIComponent(q.owner) }, [ ownerName ]));
        });
      } else {
        takeAuthor.textContent = 'Author: Unknown';
      }
    }

    let hasSubmitted = false;
    let latestResultId = null;

    function renderRatingActions() {
      const host = $('rating-actions');
      if (!host) return;
      host.innerHTML = '';

      const user = getCurrentUser();
      const ratingBox = el('div', { class: 'rating-submit-box' });
      const canRate = !!user && hasSubmitted;
      const helperText = !user
        ? 'Sign in to rate this quiz.'
        : (hasSubmitted ? 'You can rate this quiz now.' : 'Submit answers to unlock rating.');
      const helper = el('div', { class: 'rating-helper' }, [ helperText ]);
      const ratingInputAttrs = {
        type: 'number',
        min: 1,
        max: 5,
        placeholder: canRate ? 'Rate 1-5' : 'Rate 1-5 (locked)'
      };
      if (!canRate) ratingInputAttrs.disabled = 'disabled';

      const reviewAttrs = {
        placeholder: canRate ? 'Leave a review (optional)' : 'Review (locked)'
      };
      if (!canRate) reviewAttrs.disabled = 'disabled';

      const submitAttrs = {
        type: 'button',
        onclick: async () => {
          if (!user) return alert('Please sign in to rate.');
          if (!hasSubmitted || !latestResultId) return alert('Submit the quiz first to rate.');
          const val = parseInt(ratingInput.value, 10);
          if (!val) return alert('Enter 1-5');
          const ratingRes = await api('/api/quizzes/' + id + '/rate', { method: 'POST', body: JSON.stringify({ rating: val, review: review.value, resultId: latestResultId }) });
          if (ratingRes && ratingRes.error) return alert(ratingRes.error);
          alert('Thanks for rating');
          await loadRatings(id, q);
        }
      };
      if (!canRate) submitAttrs.disabled = 'disabled';

      const ratingInput = el('input', ratingInputAttrs);
      const review = el('textarea', reviewAttrs);
      const submitRating = el('button', submitAttrs, ['Submit Rating']);

      ratingBox.appendChild(helper);
      ratingBox.appendChild(ratingInput);
      ratingBox.appendChild(review);
      ratingBox.appendChild(submitRating);
      host.appendChild(ratingBox);
    }

    q.questions.forEach((question, qi) => {
      const qdiv = el('div', { class: 'take-question' });
      qdiv.appendChild(el('h3', {}, [ question.text ]));
      if (question.description) {
        const d = el('div', { class: 'question-desc' });
        d.innerHTML = renderMarkdown(question.description);
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
        const leftItems = Array.isArray(question.leftItems)
          ? question.leftItems
          : (question.pairs || []).map(p => p.left);
        const rightOptions = Array.isArray(question.rightOptions)
          ? question.rightOptions
          : (question.pairs || []).map(p => p.right);
        const rights = rightOptions.slice();
        // randomize displayed right-side options
        const shuffled = shuffle(rights.slice());
        leftItems.forEach((left) => {
          const sel = el('select', { name: 'q' + qi });
          // default placeholder option
          sel.appendChild(el('option', { value: '' }, [ '{Choose}' ]));
          shuffled.forEach(r => { const o = el('option', { value: r }, [ r ]); sel.appendChild(o); });
          const row = el('div', {}, [ el('strong', {}, [ left ]), sel ]);
          qdiv.appendChild(row);
        });
      } else if (type === 'text') {
        const ta = el('textarea', { name: 'q' + qi, placeholder: 'Your answer' });
        qdiv.appendChild(ta);
      } else if (type === 'number') {
        const ni = el('input', { type: 'number', step: 'any', name: 'q' + qi, placeholder: 'Your numeric answer' });
        qdiv.appendChild(ni);
      }
      form.appendChild(qdiv);
    });

    renderRatingActions();
    loadRatings(id, q);

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
        } else if (type === 'number') {
          const ni = form.querySelector('input[name="q' + qi + '"]');
          const raw = ni ? ni.value : '';
          const num = parseFloat(raw);
          answers.push(Number.isFinite(num) ? num : null);
        }
      });
      const user = getCurrentUser();
      const res = await api('/api/quizzes/' + id + '/submit', { method: 'POST', body: JSON.stringify({ answers }) });
      const resultEl = $('result'); if (resultEl) resultEl.textContent = `Score: ${res.score}% (${res.correct}/${res.total})`;
      const feedbackHostAfterSubmit = $('submission-feedback');
      if (feedbackHostAfterSubmit) {
        feedbackHostAfterSubmit.innerHTML = '';
        if (Array.isArray(res.questionResults)) {
          const list = el('ul', { class: 'submission-feedback-list' });
          res.questionResults.forEach(item => {
            const status = item.correct ? '✅ Correct' : '❌ Incorrect';
            const li = el('li', {}, [ el('strong', {}, [ `Q${(item.index || 0) + 1}: ${status}` ]), el('div', {}, [ item.text || '' ]) ]);
            if (!item.correct && item.correctAnswer != null) {
              let answerText = '';
              if (Array.isArray(item.correctAnswer)) {
                if (item.correctAnswer.length && typeof item.correctAnswer[0] === 'object') {
                  answerText = item.correctAnswer.map(p => `${p.left} → ${p.right}`).join(' | ');
                } else {
                  answerText = item.correctAnswer.join(', ');
                }
              } else if (typeof item.correctAnswer === 'object') {
                answerText = JSON.stringify(item.correctAnswer);
              } else {
                answerText = String(item.correctAnswer);
              }
              li.appendChild(el('div', {}, [ `Correct answer: ${answerText}` ]));
            }
            list.appendChild(li);
          });
          feedbackHostAfterSubmit.appendChild(list);
        }
      }
      hasSubmitted = true;
      latestResultId = res && res.resultId ? res.resultId : null;
      renderRatingActions();
      loadRatings(id, q);
    };
  });
}

async function loadRatings(quizId, quizObj) {
  const panel = $('ratings-panel');
  if (!panel) return;
  panel.innerHTML = '';
  const ratings = await api('/api/quizzes/' + quizId + '/ratings');
  const usersRes = await api('/api/users');
  const users = Array.isArray(usersRes) ? usersRes : [];
  const userMap = {};
  users.forEach(u => { if (u && u.id) userMap[u.id] = u.username || u.id; });

  const avg = (quizObj && quizObj.averageRating) ? quizObj.averageRating : (ratings && ratings.length ? Math.round(ratings.reduce((s,r)=>s+r.rating,0)/ratings.length*10)/10 : 'N/A');
  const header = el('div', { class: 'ratings-header' }, [ `Average: ${avg} — ${ratings ? ratings.length : 0} rating(s)` ]);
  panel.appendChild(header);

  if (!ratings || ratings.length === 0) {
    panel.appendChild(el('div', {}, ['No ratings yet.']));
    return;
  }

  // list reviews (most recent first)
  ratings.sort((a,b)=> new Date(b.timestamp) - new Date(a.timestamp));
  const list = el('ul', { class: 'ratings-list' });
  ratings.forEach(r => {
    const who = r.userId ? (userMap[r.userId] || r.userId) : 'Anonymous';
    const li = el('li', {}, [ el('strong', {}, [ `${who} — ${r.rating}/5` ]), el('div', {}, [ r.review || '' ]), el('small', {}, [ new Date(r.timestamp).toLocaleString() ]) ]);
    list.appendChild(li);
  });
  panel.appendChild(list);
}

const addQuestionBtn = $('add-question'); if (addQuestionBtn) addQuestionBtn.addEventListener('click', () => addQuestionBlock());

const saveQuizBtn = $('save-quiz'); if (saveQuizBtn) saveQuizBtn.addEventListener('click', async () => {
  const title = document.getElementById('quiz-title').value.trim();
  const desc = document.getElementById('quiz-description') ? document.getElementById('quiz-description').value : '';
  const showQuestionResults = $('show-question-results') ? $('show-question-results').checked : false;
  const showCorrectAnswersForIncorrect = $('show-correct-answers') ? $('show-correct-answers').checked : false;
  const blocks = Array.from(document.querySelectorAll('.question-block'));
  const { questions, errors } = collectAndValidateQuestions(blocks);
  if (!title) {
    alert('Please enter a quiz title.');
    return;
  }
  if (questions.length === 0) {
    alert('Add at least one question.');
    addQuestionBlock();
    return;
  }
  if (errors.length) {
    alert('Please fix these issues before saving:\n\n' + errors.join('\n'));
    return;
  }

  saveQuizBtn.disabled = true;
  const originalText = saveQuizBtn.textContent;
  saveQuizBtn.textContent = editingId ? 'Updating...' : 'Saving...';
  let nextButtonText = 'Save Quiz';
  if (editingId) {
    const res = await api('/api/quizzes/' + editingId, { method: 'PUT', body: JSON.stringify({ title, questions, description: desc, showQuestionResults, showCorrectAnswersForIncorrect }) });
    if (res && res.error) {
      alert(res.error);
      saveQuizBtn.disabled = false;
      saveQuizBtn.textContent = originalText;
      return;
    }
    editingId = null;
    const ei = $('edit-indicator'); if (ei) ei.classList.add('hidden');
    nextButtonText = 'Save Quiz';
  } else {
    const res = await api('/api/quizzes', { method: 'POST', body: JSON.stringify({ title, questions, description: desc, showQuestionResults, showCorrectAnswersForIncorrect }) });
    if (res && res.error) {
      alert(res.error);
      saveQuizBtn.disabled = false;
      saveQuizBtn.textContent = originalText;
      return;
    }
  }
  document.getElementById('quiz-title').value = '';
  if ($('show-question-results')) $('show-question-results').checked = false;
  if ($('show-correct-answers')) $('show-correct-answers').checked = false;
  document.getElementById('questions').innerHTML = '';
  addQuestionBlock();
  saveQuizBtn.disabled = false;
  saveQuizBtn.textContent = nextButtonText;
  refreshQuizList();
  window.location.reload();
});

// init
refreshQuizList();

// auth bindings
const signupBtn = $('signup'); if (signupBtn) signupBtn.addEventListener('click', signup);
const loginBtn = $('login'); if (loginBtn) loginBtn.addEventListener('click', login);
const logoutBtn = $('logout'); if (logoutBtn) logoutBtn.addEventListener('click', logout);

// search
const searchBtn = $('search-btn'); if (searchBtn) searchBtn.addEventListener('click', () => refreshQuizList());

const jsonQuizFile = $('json-quiz-file');
const jsonLoadBtn = $('json-load-btn');
if (jsonLoadBtn && jsonQuizFile) {
  jsonLoadBtn.addEventListener('click', async () => {
    const file = jsonQuizFile.files && jsonQuizFile.files[0] ? jsonQuizFile.files[0] : null;
    if (!file) {
      alert('Choose a JSON file first.');
      return;
    }

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const pickedQuiz = pickQuizFromJsonPayload(parsed);
      if (!pickedQuiz || !Array.isArray(pickedQuiz.questions)) {
        alert('Invalid quiz JSON. Expected an object with a questions array.');
        return;
      }
      const normalizedQuiz = normalizeImportedQuiz(pickedQuiz);
      applyQuizToEditor(normalizedQuiz);
      const statusEl = $('ai-generate-status');
      if (statusEl) statusEl.textContent = `Loaded draft from ${file.name}.`;
    } catch (err) {
      alert('Could not parse JSON file.');
    }
  });
}

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
  const rolesEl = $('profile-roles');
  if (rolesEl) {
    const roles = Array.isArray(profile.roles) ? profile.roles : [];
    rolesEl.textContent = roles.length ? roles.join(', ') : 'member';
  }
  const avg = $('profile-avg'); if (avg) avg.textContent = profile.averageScore || 0;
  const cnt = $('profile-count'); if (cnt) cnt.textContent = profile.quizCount || 0;

  const profileTabMain = $('profile-tab-profile');
  const profileTabSettings = $('profile-tab-settings');
  const panelMain = $('profile-panel-main');
  const panelSettings = $('profile-panel-settings');
  const isOwnProfile = !!(cur && cur.id === userId);

  function setActiveProfileTab(tabName) {
    if (!panelMain || !panelSettings || !profileTabMain || !profileTabSettings) return;
    const showSettings = tabName === 'settings' && isOwnProfile;
    panelMain.classList.toggle('hidden', showSettings);
    panelSettings.classList.toggle('hidden', !showSettings);
    profileTabMain.classList.toggle('active', !showSettings);
    profileTabSettings.classList.toggle('active', showSettings);
  }

  if (profileTabMain) profileTabMain.addEventListener('click', () => setActiveProfileTab('profile'));
  if (profileTabSettings) profileTabSettings.addEventListener('click', () => setActiveProfileTab('settings'));

  if (profileTabSettings && !isOwnProfile) {
    profileTabSettings.classList.add('hidden');
  }

  const aiProviderEl = $('settings-ai-provider');
  const openAiWrapEl = $('settings-openai-wrap');
  const openAiModelEl = $('settings-openai-model');
  const openAiKeyEl = $('settings-openai-key');
  const defaultDifficultyEl = $('settings-default-difficulty');
  const defaultCountEl = $('settings-default-count');
  const reviewPromptsEl = $('settings-review-prompts');
  const saveSettingsBtn = $('settings-save');
  const settingsStatusEl = $('settings-status');

  function toggleOpenAiSettings() {
    if (!aiProviderEl || !openAiWrapEl) return;
    const isOpenAi = aiProviderEl.value === 'openai';
    openAiWrapEl.classList.toggle('hidden', !isOpenAi);
  }

  if (isOwnProfile && aiProviderEl && openAiModelEl && openAiKeyEl && defaultDifficultyEl && defaultCountEl && reviewPromptsEl) {
    const settings = readUserSettings(userId);
    aiProviderEl.value = settings.aiProvider === 'openai' ? 'openai' : 'local';
    openAiModelEl.value = settings.openaiModel || 'gpt-4.1-mini';
    openAiKeyEl.value = settings.openaiApiKey || '';
    defaultDifficultyEl.value = (settings.defaultDifficulty === 'easy' || settings.defaultDifficulty === 'medium' || settings.defaultDifficulty === 'hard')
      ? settings.defaultDifficulty
      : 'medium';
    defaultCountEl.value = String(Number.isFinite(parseInt(settings.defaultQuestionCount, 10)) ? parseInt(settings.defaultQuestionCount, 10) : 8);
    reviewPromptsEl.checked = settings.reviewGeneratedQuestions !== false;
    toggleOpenAiSettings();

    if (aiProviderEl) {
      aiProviderEl.addEventListener('change', () => {
        toggleOpenAiSettings();
        if (settingsStatusEl) settingsStatusEl.textContent = '';
      });
    }

    if (saveSettingsBtn) {
      saveSettingsBtn.addEventListener('click', () => {
        const provider = aiProviderEl.value === 'openai' ? 'openai' : 'local';
        const openaiModel = (openAiModelEl.value || '').trim() || 'gpt-4.1-mini';
        const openaiApiKey = (openAiKeyEl.value || '').trim();
        const defaultDifficulty = (defaultDifficultyEl.value || 'medium').trim().toLowerCase();
        const parsedCount = parseInt(defaultCountEl.value, 10);
        const defaultQuestionCount = Number.isFinite(parsedCount) ? Math.max(3, Math.min(20, parsedCount)) : 8;
        const reviewGeneratedQuestions = !!reviewPromptsEl.checked;

        if (provider === 'openai' && !openaiApiKey) {
          if (settingsStatusEl) settingsStatusEl.textContent = 'OpenAI API key is required when provider is OpenAI.';
          return;
        }

        writeUserSettings(userId, {
          aiProvider: provider,
          openaiModel,
          openaiApiKey,
          defaultDifficulty: ['easy', 'medium', 'hard'].includes(defaultDifficulty) ? defaultDifficulty : 'medium',
          defaultQuestionCount,
          reviewGeneratedQuestions
        });

        if (settingsStatusEl) settingsStatusEl.textContent = 'Settings saved.';
      });
    }
  }

  if (settingsStatusEl && !isOwnProfile) {
    settingsStatusEl.textContent = 'Settings are only available on your own profile.';
  }

  const adminDeleteBtn = $('admin-delete-user');
  if (adminDeleteBtn) {
    adminDeleteBtn.classList.add('hidden');
    adminDeleteBtn.onclick = null;
    if (cur && cur.id) {
      const myRoles = await fetchRolesForUser(cur.id);
      const isAdminUser = myRoles.includes('admin');
      if (isAdminUser) {
        adminDeleteBtn.classList.remove('hidden');
        adminDeleteBtn.onclick = async () => {
          const username = userObj && userObj.username ? userObj.username : userId;
          if (!confirm('Delete account for ' + username + '? This also deletes their quizzes.')) return;
          const res = await api('/api/users/' + userId, { method: 'DELETE' });
          if (res && res.error) return alert(res.error);
          alert('Account deleted');
          window.location.href = '/';
        };
      }
    }
  }

  setActiveProfileTab('profile');

  function normalizeAvatarUrl(rawValue) {
    if (!rawValue || typeof rawValue !== 'string') return null;
    const raw = rawValue.trim();
    if (!raw) return null;

    if (/^https?:\/\//i.test(raw)) {
      try {
        const parsed = new URL(raw);
        const pathOnly = parsed.pathname || '';
        if (pathOnly) return pathOnly;
      } catch (err) {}
    }

    if (raw.startsWith('/')) return raw;
    return '/' + raw;
  }

  function setAvatarWithFallback(imageEl, preferredUrl, uid) {
    const candidates = [];
    const normalizedPreferred = normalizeAvatarUrl(preferredUrl);
    if (normalizedPreferred) candidates.push(normalizedPreferred);
    if (uid) {
      const base = '/uploads/' + uid;
      candidates.push(base + '.png', base + '.webp', base + '.jpg', base + '.jpeg', base + '.gif');
    }

    const seen = new Set();
    const uniqueCandidates = candidates.filter(url => {
      if (!url || seen.has(url)) return false;
      seen.add(url);
      return true;
    });

    let idx = 0;
    const tryNext = () => {
      if (idx >= uniqueCandidates.length) {
        imageEl.onerror = null;
        imageEl.src = 'default-avatar.png';
        return;
      }
      const nextUrl = uniqueCandidates[idx++];
      imageEl.onerror = tryNext;
      imageEl.src = nextUrl;
    };

    tryNext();
  }

  const avatarImg = $('profile-avatar'); if (avatarImg) {
    const stableAvatarUrl = '/avatars/' + encodeURIComponent(userId);
    setAvatarWithFallback(avatarImg, stableAvatarUrl, userId);
  }
  const quizzes = await api('/api/users/' + userId + '/quizzes');
  const uq = $('user-quizzes'); if (uq) {
    uq.innerHTML = '';
    quizzes.forEach(q => {
      const li = el('li');
      const a = el('a', { href: '/share/' + encodeURIComponent(q.id) }, [ q.title ]);
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
  if (!isOwnProfile) {
    if (uploadForm) uploadForm.style.display = 'none';
  } else {
    const uploadBtn = $('upload-avatar'); if (uploadBtn) uploadBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      const fileInput = $('avatar-file'); if (!fileInput || !fileInput.files[0]) return alert('Choose a file');
      const fd = new FormData(); fd.append('avatar', fileInput.files[0]);
      const auth = getCurrentUser();
      const headers = {};
      if (auth && auth.token) headers.Authorization = 'Bearer ' + auth.token;
      const res = await fetch('/api/users/' + userId + '/avatar', { method: 'POST', headers, body: fd });
      const data = await res.json();
      if (data.avatar) {
        const avatarImg2 = $('profile-avatar');
        if (avatarImg2) {
          const stableAvatarUrl = '/avatars/' + encodeURIComponent(userId);
          avatarImg2.src = stableAvatarUrl + '?v=' + Date.now();
        }
        alert('Uploaded');
      }
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
  } else {
    const questions = $('questions');
    if (questions && questions.children.length === 0) addQuestionBlock();
  }
}

if (isCreatePage || isEditPage) initAiQuizGenerator();

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
    const showResults = $('show-question-results'); if (showResults) showResults.checked = false;
    const showAnswers = $('show-correct-answers'); if (showAnswers) showAnswers.checked = false;
    const questions = $('questions'); if (questions) questions.innerHTML = '';
    addQuestionBlock();
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
