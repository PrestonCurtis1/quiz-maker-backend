const express = require('express');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

const bcrypt = require('bcryptjs');
const app = express();
const DATA_DIR = path.join(__dirname, 'data');
const RESULTS_FILE = path.join(DATA_DIR, 'results.json');
const DATA_FILE = path.join(DATA_DIR, 'quizzes.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const RATINGS_FILE = path.join(DATA_DIR, 'ratings.json');
const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');
const PORT = process.env.PORT || 3000;

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
  res.json(Object.assign({}, q, { averageRating: avg, ratingsCount: itemRatings.length }));
});

app.post('/api/quizzes', async (req, res) => {
  const { title, questions, owner, description } = req.body;
  if (!title || !Array.isArray(questions)) return res.status(400).json({ error: 'Invalid payload' });
  const data = await readData();
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const quiz = { id, title, questions, owner: owner || null, description: description || '' };
  data.push(quiz);
  await writeData(data);
  res.json({ id });
});

app.put('/api/quizzes/:id', async (req, res) => {
  const { title, questions, owner, description } = req.body;
  if (!title || !Array.isArray(questions)) return res.status(400).json({ error: 'Invalid payload' });
  const data = await readData();
  const idx = data.findIndex(item => item.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  // allow update if owner matches or no owner
  if (data[idx].owner && owner && data[idx].owner !== owner) return res.status(403).json({ error: 'Forbidden' });
  data[idx].title = title;
  data[idx].questions = questions;
  data[idx].owner = owner || data[idx].owner || null;
  data[idx].description = description || data[idx].description || '';
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
    data.push({ id, title: q.title, questions: q.questions, owner: q.owner || null, description: q.description || '' });
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
  res.json({ id, username });
});

app.post('/api/users/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Invalid payload' });
  const users = await readUsers();
  const user = users.find(u => u.username === username);
  if (!user) return res.status(400).json({ error: 'Invalid credentials' });
  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.status(400).json({ error: 'Invalid credentials' });
  res.json({ id: user.id, username: user.username });
});

app.get('/api/users', async (req, res) => {
  const users = await readUsers();
  res.json(users.map(u => ({ id: u.id, username: u.username, avatar: u.avatar || null })));
});

app.get('/api/users/:id/results', async (req, res) => {
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
  const { answers, userId } = req.body;
  if (!Array.isArray(answers)) return res.status(400).json({ error: 'Invalid payload' });
  const data = await readData();
  const q = data.find(item => item.id === req.params.id);
  if (!q) return res.status(404).json({ error: 'Not found' });
  let totalFraction = 0;
  q.questions.forEach((question, idx) => {
    const userAns = answers[idx];
    const type = question.type || 'multiple';
    if (type === 'multiple') {
      totalFraction += (userAns === question.correct) ? 1 : 0;
    } else if (type === 'multi') {
    const options = Array.isArray(question.options) ? question.options : [];
    let correct = 0;
    let incorrect = 0;
    for (option = 0; option < options.length; option++) {
        let isCorrect = question.correct.includes(option);
        if (isCorrect) {
            if (userAns.includes(option)) {
                correct++;
            } else {
                incorrect++;
            }
        } else {
            if (userAns.includes(option)) {
                incorrect++;
            } else {
                correct++;
            }
        }
    }
    const totalOptions = options.length;
    const fraction = correct / totalOptions;
    totalFraction += fraction;
    } else if (type === 'matching') {
      const pairs = Array.isArray(question.pairs) ? question.pairs : [];
      const userPairs = Array.isArray(userAns) ? userAns : [];
      if (pairs.length === 0) { return; }
      let matched = 0;
      pairs.forEach((p, i) => { if (userPairs[i] === p.right) matched++; });
      totalFraction += (matched / pairs.length);
    } else if (type === 'text' || type === 'fill') {
      if (!question.answer) return;
      const expected = Array.isArray(question.answer) ? question.answer : [question.answer];
      const ans = (typeof userAns === 'string') ? userAns.trim().toLowerCase() : '';
      if (expected.map(s => s.trim().toLowerCase()).includes(ans)) totalFraction += 1;
    } else if (type === 'truefalse') {
      if (typeof question.correct === 'boolean' && typeof userAns === 'boolean') {
        totalFraction += (userAns === question.correct) ? 1 : 0;
      }
    }
  });
  const totalQuestions = q.questions.length || 1;
  const scorePercent = Math.round(100 * (totalFraction / totalQuestions));

  // save result
  const results = await readResults();
  const rid = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const result = { id: rid, quizId: q.id, userId: userId || null, score: scorePercent, raw: totalFraction, totalQuestions, timestamp: new Date().toISOString(), answers };
  results.push(result);
  await writeResults(results);

  res.json({ total: totalQuestions, correct: totalFraction, score: scorePercent, resultId: rid });
});

// ratings endpoints
app.post('/api/quizzes/:id/rate', async (req, res) => {
  const { userId, rating, review } = req.body;
  if (!rating || typeof rating !== 'number') return res.status(400).json({ error: 'Invalid payload' });
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
  const data = await readData();
  const userQuizzes = data.filter(q => q.owner === req.params.id);
  res.json(userQuizzes);
});

ensureDataFile().then(() => ensureHashedPasswords()).then(() => {
  app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
});
