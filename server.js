const express = require('express');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const app = express();
const DATA_DIR = path.join(__dirname, 'data');
const RESULTS_FILE = path.join(DATA_DIR, 'results.json');
const DATA_FILE = path.join(DATA_DIR, 'quizzes.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const RATINGS_FILE = path.join(DATA_DIR, 'ratings.json');
const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');
const PORT = process.env.PORT || 80;
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret-in-production';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

async function ensureDataFile() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    if (!fsSync.existsSync(DATA_FILE)) {
      await fs.writeFile(DATA_FILE, '[]', 'utf8');
    }
    if (!fsSync.existsSync(USERS_FILE)) {
      // create a demo user
      const demo = [{ id: 'u_demo', username: 'demo', password: 'demo' }];
      await fs.writeFile(USERS_FILE, JSON.stringify(demo, null, 2), 'utf8');
    }
    if (!fsSync.existsSync(RESULTS_FILE)) {
      await fs.writeFile(RESULTS_FILE, '[]', 'utf8');
    }
    if (!fsSync.existsSync(RATINGS_FILE)) {
      await fs.writeFile(RATINGS_FILE, '[]', 'utf8');
    }
    // ensure uploads folder exists
    if (!fsSync.existsSync(UPLOAD_DIR)) {
      fsSync.mkdirSync(UPLOAD_DIR, { recursive: true });
    }
  } catch (err) {
    console.error('Error ensuring data file:', err);
  }
}

async function readRatings() {
  await ensureDataFile();
  const txt = await fs.readFile(RATINGS_FILE, 'utf8');
  return JSON.parse(txt || '[]');
}

async function writeRatings(data) {
  await fs.writeFile(RATINGS_FILE, JSON.stringify(data, null, 2), 'utf8');
}

async function readResults() {
  await ensureDataFile();
  const txt = await fs.readFile(RESULTS_FILE, 'utf8');
  return JSON.parse(txt || '[]');
}

async function writeResults(data) {
  await fs.writeFile(RESULTS_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// on startup, hash any plain-text passwords in users file
async function ensureHashedPasswords() {
  const users = await readUsers();
  let changed = false;
  for (const u of users) {
    if (typeof u.password === 'string' && !u.password.startsWith('$2a$') && !u.password.startsWith('$2b$')) {
      u.password = await bcrypt.hash(u.password, 10);
      changed = true;
    }
  }
  if (changed) await writeUsers(users);
}

async function readUsers() {
  await ensureDataFile();
  const txt = await fs.readFile(USERS_FILE, 'utf8');
  return JSON.parse(txt || '[]');
}

async function writeUsers(data) {
  await fs.writeFile(USERS_FILE, JSON.stringify(data, null, 2), 'utf8');
}

async function readData() {
  await ensureDataFile();
  const txt = await fs.readFile(DATA_FILE, 'utf8');
  return JSON.parse(txt || '[]');
}

async function writeData(data) {
  await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function signAuthToken(user) {
  return jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
}

function getAuthUser(req) {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) return null;
  const token = auth.slice('Bearer '.length);
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (!payload || !payload.id) return null;
    return { id: payload.id, username: payload.username || null };
  } catch (err) {
    return null;
  }
}

function requireAuth(req, res, next) {
  const user = getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  req.authUser = user;
  next();
}

function sanitizeQuestionForPublic(question) {
  if (!question || typeof question !== 'object') return question;
  const type = question.type || 'multiple';

  if (type === 'matching') {
    const pairs = Array.isArray(question.pairs) ? question.pairs : [];
    return {
      type: 'matching',
      text: question.text || '',
      description: question.description || '',
      leftItems: pairs.map(p => p.left),
      rightOptions: pairs.map(p => p.right)
    };
  }

  const safeQuestion = Object.assign({}, question);
  delete safeQuestion.correct;
  delete safeQuestion.answer;
  delete safeQuestion.answers;
  return safeQuestion;
}

function sanitizeQuizForPublic(quiz) {
  const safeQuiz = Object.assign({}, quiz);
  safeQuiz.questions = (quiz.questions || []).map(sanitizeQuestionForPublic);
  return safeQuiz;
}

function formatCorrectAnswerForDisplay(question) {
  const type = question.type || 'multiple';
  if (type === 'multiple') {
    const index = question.correct;
    if (typeof index === 'number' && Array.isArray(question.options)) return question.options[index] != null ? question.options[index] : index;
    return index;
  }
  if (type === 'multi') {
    const indices = Array.isArray(question.correct) ? question.correct : [];
    const options = Array.isArray(question.options) ? question.options : [];
    return indices.map(i => options[i] != null ? options[i] : i);
  }
  if (type === 'matching') {
    const pairs = Array.isArray(question.pairs) ? question.pairs : [];
    return pairs.map(p => ({ left: p.left, right: p.right }));
  }
  if (type === 'text' || type === 'fill') {
    return Array.isArray(question.answer) ? question.answer : [question.answer];
  }
  if (type === 'number') {
    return Array.isArray(question.answer) ? question.answer : [question.answer];
  }
  if (type === 'truefalse') {
    return question.correct;
  }
  return null;
}

app.get('/api/quizzes', async (req, res) => {
  const data = await readData();
  const ratings = await readRatings();
  const q = req.query.search ? req.query.search.toLowerCase() : null;
  const list = data.filter(item => {
    if (!q) return true;
    const inTitle = item.title && item.title.toLowerCase().includes(q);
    const inDesc = item.description && item.description.toLowerCase().includes(q);
    return inTitle || inDesc;
  }).map(item => {
    const itemRatings = ratings.filter(r => r.quizId === item.id);
    const avg = itemRatings.length ? Math.round(itemRatings.reduce((s, r) => s + r.rating, 0) / itemRatings.length * 10) / 10 : null;
    return { id: item.id, title: item.title, owner: item.owner || null, description: item.description || '', averageRating: avg };
  });
  res.json(list);
});

app.get('/api/quizzes/:id', async (req, res) => {
  const data = await readData();
  const q = data.find(item => item.id === req.params.id);
  if (!q) return res.status(404).json({ error: 'Not found' });
  // include ratings summary
  const ratings = await readRatings();
  const itemRatings = ratings.filter(r => r.quizId === q.id);
  const avg = itemRatings.length ? Math.round(itemRatings.reduce((s, r) => s + r.rating, 0) / itemRatings.length * 10) / 10 : null;
  res.json(Object.assign({}, sanitizeQuizForPublic(q), { averageRating: avg, ratingsCount: itemRatings.length }));
});

app.get('/api/quizzes/:id/edit', async (req, res) => {
  const authUser = getAuthUser(req);
  if (!authUser) return res.status(401).json({ error: 'Unauthorized' });
  const data = await readData();
  const q = data.find(item => item.id === req.params.id);
  if (!q) return res.status(404).json({ error: 'Not found' });
  if (q.owner && q.owner !== authUser.id) return res.status(403).json({ error: 'Forbidden' });
  res.json(q);
});

app.post('/api/quizzes', async (req, res) => {
  const authUser = getAuthUser(req);
  if (!authUser) return res.status(401).json({ error: 'Unauthorized' });
  const { title, questions, description, showQuestionResults, showCorrectAnswersForIncorrect } = req.body;
  if (!title || !Array.isArray(questions)) return res.status(400).json({ error: 'Invalid payload' });
  const data = await readData();
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const quiz = {
    id,
    title,
    questions,
    owner: authUser.id,
    description: description || '',
    showQuestionResults: !!showQuestionResults,
    showCorrectAnswersForIncorrect: !!showCorrectAnswersForIncorrect
  };
  data.push(quiz);
  await writeData(data);
  res.json({ id });
});

app.put('/api/quizzes/:id', async (req, res) => {
  const authUser = getAuthUser(req);
  if (!authUser) return res.status(401).json({ error: 'Unauthorized' });
  const { title, questions, description, showQuestionResults, showCorrectAnswersForIncorrect } = req.body;
  if (!title || !Array.isArray(questions)) return res.status(400).json({ error: 'Invalid payload' });
  const data = await readData();
  const idx = data.findIndex(item => item.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  if (data[idx].owner && data[idx].owner !== authUser.id) return res.status(403).json({ error: 'Forbidden' });
  data[idx].title = title;
  data[idx].questions = questions;
  data[idx].owner = data[idx].owner || authUser.id;
  data[idx].description = description || data[idx].description || '';
  data[idx].showQuestionResults = !!showQuestionResults;
  data[idx].showCorrectAnswersForIncorrect = !!showCorrectAnswersForIncorrect;
  await writeData(data);
  res.json({ ok: true });
});

app.post('/api/import', async (req, res) => {
  const { quizzes } = req.body;
  if (!Array.isArray(quizzes)) return res.status(400).json({ error: 'Invalid payload' });
  const data = await readData();
  let added = 0;
  for (const q of quizzes) {
    if (!q.title || !Array.isArray(q.questions)) continue;
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    data.push({
      id,
      title: q.title,
      questions: q.questions,
      owner: q.owner || null,
      description: q.description || '',
      showQuestionResults: !!q.showQuestionResults,
      showCorrectAnswersForIncorrect: !!q.showCorrectAnswersForIncorrect
    });
    added++;
  }
  await writeData(data);
  res.json({ added });
});

app.get('/api/export', async (req, res) => {
  const data = await readData();
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(data, null, 2));
});

// simple user endpoints (demo only)
app.post('/api/users/signup', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Invalid payload' });
  const users = await readUsers();
  if (users.find(u => u.username === username)) return res.status(400).json({ error: 'User exists' });
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const hash = await bcrypt.hash(password, 10);
  const user = { id, username, password: hash };
  users.push(user);
  await writeUsers(users);
  const token = signAuthToken(user);
  res.json({ id, username, token });
});

app.post('/api/users/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Invalid payload' });
  const users = await readUsers();
  const user = users.find(u => u.username === username);
  if (!user) return res.status(400).json({ error: 'Invalid credentials' });
  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.status(400).json({ error: 'Invalid credentials' });
  const token = signAuthToken(user);
  res.json({ id: user.id, username: user.username, token });
});

app.get('/api/users', async (req, res) => {
  const users = await readUsers();
  res.json(users.map(u => ({ id: u.id, username: u.username, avatar: u.avatar || null })));
});

app.get('/api/users/:id/results', async (req, res) => {
  const authUser = getAuthUser(req);
  if (!authUser || authUser.id !== req.params.id) return res.status(403).json({ error: 'Forbidden' });
  const results = await readResults();
  const userResults = results.filter(r => r.userId === req.params.id);
  res.json(userResults);
});

app.get('/api/users/:id/profile', async (req, res) => {
  const results = await readResults();
  const userResults = results.filter(r => r.userId === req.params.id);
  const count = userResults.length;
  const avg = count ? Math.round(userResults.reduce((s, r) => s + r.score, 0) / count) : 0;
  res.json({ userId: req.params.id, quizCount: count, averageScore: avg });
});

app.post('/api/quizzes/:id/submit', async (req, res) => {
  const { answers } = req.body;
  const authUser = getAuthUser(req);
  const userId = authUser ? authUser.id : null;
  if (!Array.isArray(answers)) return res.status(400).json({ error: 'Invalid payload' });
  const data = await readData();
  const q = data.find(item => item.id === req.params.id);
  if (!q) return res.status(404).json({ error: 'Not found' });

  function toIntegerOrNull(value) {
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function toNumberOrNull(value) {
    const parsed = (typeof value === 'number') ? value : parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function normalizeText(value) {
    if (value == null) return '';
    return String(value).trim().toLowerCase();
  }

  let totalFraction = 0;
  const questionFeedback = [];
  q.questions.forEach((question, idx) => {
    const userAns = answers[idx];
    const type = question.type || 'multiple';
    let fraction = 0;
    if (type === 'multiple') {
      const selected = toIntegerOrNull(userAns);
      const expected = toIntegerOrNull(question.correct);
      fraction = (selected != null && expected != null && selected === expected) ? 1 : 0;
      totalFraction += fraction;
    } else if (type === 'multi') {
      const options = Array.isArray(question.options) ? question.options : [];
      const correctAnswers = (Array.isArray(question.correct) ? question.correct : [])
        .map(toIntegerOrNull)
        .filter(value => value != null);
      const selected = (Array.isArray(userAns) ? userAns : [])
        .map(toIntegerOrNull)
        .filter(value => value != null);
      let correct = 0;
      for (let optionIndex = 0; optionIndex < options.length; optionIndex++) {
        const shouldSelect = correctAnswers.includes(optionIndex);
        const didSelect = selected.includes(optionIndex);
        if ((shouldSelect && didSelect) || (!shouldSelect && !didSelect)) {
          correct++;
        }
      }
      const totalOptions = options.length || 1;
      fraction = correct / totalOptions;
      totalFraction += fraction;
    } else if (type === 'matching') {
      const pairs = Array.isArray(question.pairs) ? question.pairs : [];
      const userPairs = Array.isArray(userAns) ? userAns : [];
      if (pairs.length === 0) { return; }
      let matched = 0;
      pairs.forEach((p, i) => { if (userPairs[i] === p.right) matched++; });
      fraction = (matched / pairs.length);
      totalFraction += fraction;
    } else if (type === 'text' || type === 'fill') {
      if (!question.answer) return;
      const expected = Array.isArray(question.answer) ? question.answer : [question.answer];
      const ans = normalizeText(userAns);
      if (expected.map(normalizeText).includes(ans)) fraction = 1;
      totalFraction += fraction;
    } else if (type === 'number') {
      if (question.answer == null) return;
      const expected = (Array.isArray(question.answer) ? question.answer : [question.answer])
        .map(toNumberOrNull)
        .filter(value => value != null);
      const ans = toNumberOrNull(userAns);
      if (ans != null) {
        const epsilon = 1e-9;
        if (expected.some(value => Math.abs(value - ans) <= epsilon)) fraction = 1;
      }
      totalFraction += fraction;
    } else if (type === 'truefalse') {
      if (typeof question.correct === 'boolean' && typeof userAns === 'boolean') {
        fraction = (userAns === question.correct) ? 1 : 0;
        totalFraction += fraction;
      }
    }

    const isCorrect = fraction >= 0.999;
    const entry = {
      index: idx,
      text: question.text || `Question ${idx + 1}`,
      correct: isCorrect
    };
    if (q.showCorrectAnswersForIncorrect && !isCorrect) {
      entry.correctAnswer = formatCorrectAnswerForDisplay(question);
    }
    questionFeedback.push(entry);
  });
  const totalQuestions = q.questions.length || 1;
  const scorePercent = Math.round(100 * (totalFraction / totalQuestions));

  // save result
  const results = await readResults();
  const rid = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const result = { id: rid, quizId: q.id, userId: userId || null, score: scorePercent, raw: totalFraction, totalQuestions, timestamp: new Date().toISOString(), answers };
  results.push(result);
  await writeResults(results);

  const payload = { total: totalQuestions, correct: totalFraction, score: scorePercent, resultId: rid };
  if (q.showQuestionResults) payload.questionResults = questionFeedback;
  res.json(payload);
});

// ratings endpoints
app.post('/api/quizzes/:id/rate', async (req, res) => {
  const { rating, review, resultId } = req.body;
  const authUser = getAuthUser(req);
  if (!authUser) return res.status(401).json({ error: 'Login required to rate' });
  const userId = authUser.id;
  if (!rating || typeof rating !== 'number') return res.status(400).json({ error: 'Invalid payload' });
  if (!resultId || typeof resultId !== 'string') return res.status(400).json({ error: 'Submit quiz before rating' });
  const results = await readResults();
  const result = results.find(r => r.id === resultId);
  if (!result || result.quizId !== req.params.id) return res.status(403).json({ error: 'Submit quiz before rating' });
  if (result.userId !== userId) return res.status(403).json({ error: 'Forbidden' });

  const ratings = await readRatings();
  const normalizedRating = Math.max(1, Math.min(5, Math.round(rating)));
  // If userId is provided, enforce one rating per user per quiz by updating existing entry
  if (userId) {
    const existing = ratings.find(r => r.quizId === req.params.id && r.userId === userId);
    if (existing) {
      existing.rating = normalizedRating;
      existing.review = (typeof review === 'string' && review.length) ? review : existing.review;
      existing.timestamp = new Date().toISOString();
      await writeRatings(ratings);
      return res.json({ ok: true, updated: true });
    }
  }
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const r = { id, quizId: req.params.id, userId: userId || null, rating: normalizedRating, review: review || '', timestamp: new Date().toISOString() };
  ratings.push(r);
  await writeRatings(ratings);
  res.json({ ok: true, created: true });
});

app.get('/api/quizzes/:id/ratings', async (req, res) => {
  const ratings = await readRatings();
  res.json(ratings.filter(r => r.quizId === req.params.id));
});

// user uploads avatar
const multer = require('multer');
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.png';
    cb(null, req.params.id + ext);
  }
});
const upload = multer({ storage });

app.post('/api/users/:id/avatar', upload.single('avatar'), async (req, res) => {
  const authUser = getAuthUser(req);
  if (!authUser || authUser.id !== req.params.id) return res.status(403).json({ error: 'Forbidden' });
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const users = await readUsers();
  const u = users.find(x => x.id === req.params.id);
  if (!u) return res.status(404).json({ error: 'User not found' });
  u.avatar = '/uploads/' + req.file.filename;
  await writeUsers(users);
  res.json({ ok: true, avatar: u.avatar });
});

// get quizzes for user
app.get('/api/users/:id/quizzes', async (req, res) => {
  const authUser = getAuthUser(req);
  if (!authUser || authUser.id !== req.params.id) return res.status(403).json({ error: 'Forbidden' });
  const data = await readData();
  const userQuizzes = data.filter(q => q.owner === req.params.id);
  res.json(userQuizzes.map(q => ({
    id: q.id,
    title: q.title,
    owner: q.owner || null,
    description: q.description || ''
  })));
});

ensureDataFile().then(() => ensureHashedPasswords()).then(() => {
  app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
});
