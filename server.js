const express = require('express');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const app = express();
const DATA_DIR = path.join(__dirname, 'data');
const RESULTS_FILE = path.join(DATA_DIR, 'results.json');
const DATA_FILE = path.join(DATA_DIR, 'quizzes.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const RATINGS_FILE = path.join(DATA_DIR, 'ratings.json');
const ROLES_FILE = path.join(DATA_DIR, 'roles.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');
const DEFAULT_AVATAR_FILE = path.join(__dirname, 'public', 'default-avatar.png');
const PORT = process.env.PORT || 80;
const HTTPS_PORT = process.env.HTTPS_PORT || 443;
const HTTP_REDIRECT_PORT = process.env.HTTP_PORT || 80;
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret-in-production';
const SSL_KEY_PATH = process.env.SSL_KEY_PATH || '';
const SSL_CERT_PATH = process.env.SSL_CERT_PATH || '';
const SSL_CA_PATH = process.env.SSL_CA_PATH || '';
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || 'https://quiz-maker.bendinghub.net';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

async function readJsonArrayFile(filePath) {
  const txt = await fs.readFile(filePath, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(txt || '[]');
  } catch (err) {
    return [];
  }
  return Array.isArray(parsed) ? parsed : [];
}

async function readJsonObjectFile(filePath) {
  const txt = await fs.readFile(filePath, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(txt || '{}');
  } catch (err) {
    return {};
  }
  return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
}

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
    if (!fsSync.existsSync(ROLES_FILE)) {
      await fs.writeFile(ROLES_FILE, JSON.stringify({ moderator: [], admin: [] }, null, 2), 'utf8');
    }
    if (!fsSync.existsSync(SETTINGS_FILE)) {
      await fs.writeFile(SETTINGS_FILE, JSON.stringify({}, null, 2), 'utf8');
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
  return readJsonArrayFile(RATINGS_FILE);
}

async function writeRatings(data) {
  await fs.writeFile(RATINGS_FILE, JSON.stringify(data, null, 2), 'utf8');
}

async function readResults() {
  await ensureDataFile();
  return readJsonArrayFile(RESULTS_FILE);
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
  return readJsonArrayFile(USERS_FILE);
}

async function writeUsers(data) {
  await fs.writeFile(USERS_FILE, JSON.stringify(data, null, 2), 'utf8');
}

async function readData() {
  await ensureDataFile();
  return readJsonArrayFile(DATA_FILE);
}

async function writeData(data) {
  await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

async function readSettingsStore() {
  await ensureDataFile();
  return readJsonObjectFile(SETTINGS_FILE);
}

async function writeSettingsStore(data) {
  const safe = (data && typeof data === 'object' && !Array.isArray(data)) ? data : {};
  await fs.writeFile(SETTINGS_FILE, JSON.stringify(safe, null, 2), 'utf8');
}

function normalizeRolesPayload(parsed) {
  const roles = (parsed && typeof parsed === 'object') ? parsed : {};
  const moderators = Array.isArray(roles.moderator) ? roles.moderator : [];
  const admins = Array.isArray(roles.admin) ? roles.admin : [];
  return {
    moderator: moderators.map(value => String(value)).filter(Boolean),
    admin: admins.map(value => String(value)).filter(Boolean)
  };
}

async function readRoles() {
  await ensureDataFile();
  try {
    const txt = await fs.readFile(ROLES_FILE, 'utf8');
    const parsed = JSON.parse(txt || '{}');
    return normalizeRolesPayload(parsed);
  } catch (err) {
    return { moderator: [], admin: [] };
  }
}

async function userHasRole(userId, roleName) {
  if (!userId || !roleName) return false;
  const roles = await readRoles();
  const members = Array.isArray(roles[roleName]) ? roles[roleName] : [];
  return members.includes(userId);
}

async function isAdmin(userId) {
  return userHasRole(userId, 'admin');
}

async function isModerator(userId) {
  if (!userId) return false;
  if (await isAdmin(userId)) return true;
  return userHasRole(userId, 'moderator');
}

async function getRolesForUser(userId) {
  if (!userId) return [];
  const roles = await readRoles();
  const result = [];
  if (Array.isArray(roles.moderator) && roles.moderator.includes(userId)) result.push('moderator');
  if (Array.isArray(roles.admin) && roles.admin.includes(userId)) result.push('admin');
  return result;
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

function normalizeUserSettings(input) {
  const payload = (input && typeof input === 'object') ? input : {};
  const provider = String(payload.aiProvider || '').toLowerCase();
  const difficulty = String(payload.defaultDifficulty || '').toLowerCase();
  const parsedCount = parseInt(payload.defaultQuestionCount, 10);

  return {
    aiProvider: provider === 'openai' ? 'openai' : 'local',
    openaiModel: String(payload.openaiModel || 'gpt-4.1-mini').trim() || 'gpt-4.1-mini',
    openaiApiKey: String(payload.openaiApiKey || '').trim(),
    reviewGeneratedQuestions: payload.reviewGeneratedQuestions !== false,
    defaultDifficulty: (difficulty === 'easy' || difficulty === 'medium' || difficulty === 'hard') ? difficulty : 'medium',
    defaultQuestionCount: Number.isFinite(parsedCount) ? Math.max(3, Math.min(50, parsedCount)) : 8
  };
}

function requireAuth(req, res, next) {
  const user = getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  req.authUser = user;
  next();
}

function resolveAvatarFileForUser(userId) {
  const safeId = String(userId || '').trim();
  if (!/^[a-zA-Z0-9_-]+$/.test(safeId)) return DEFAULT_AVATAR_FILE;

  const preferredExts = ['.png', '.webp', '.jpg', '.jpeg', '.gif'];
  for (const ext of preferredExts) {
    const candidate = path.join(UPLOAD_DIR, safeId + ext);
    if (fsSync.existsSync(candidate)) return candidate;
  }

  try {
    const files = fsSync.readdirSync(UPLOAD_DIR);
    const fallback = files.find(name => name.startsWith(safeId + '.'));
    if (fallback) {
      const full = path.join(UPLOAD_DIR, fallback);
      if (fsSync.existsSync(full)) return full;
    }
  } catch (err) {}

  return DEFAULT_AVATAR_FILE;
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

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getPublicBaseUrl(req) {
  const configured = String(PUBLIC_BASE_URL || '').trim();
  if (configured) return configured.replace(/\/+$/, '');

  const forwardedProtoHeader = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const proto = forwardedProtoHeader || req.protocol || 'http';
  const forwardedHost = String(req.headers['x-forwarded-host'] || '').split(',')[0].trim();
  const host = forwardedHost || req.get('host') || 'localhost';
  return `${proto}://${host}`;
}

function escapeXml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

app.get('/sitemap.xml', async (req, res) => {
  const baseUrl = getPublicBaseUrl(req);
  const corePaths = ['/', '/create.html', '/login.html', '/profile.html', '/edit.html'];

  const data = await readData();
  const quizPaths = data
    .filter(q => q && q.id)
    .map(q => '/share/' + encodeURIComponent(q.id));
  const takeQuizPaths = data
    .filter(q => q && q.id)
    .map(q => '/take.html?quiz=' + encodeURIComponent(q.id));

  const users = await readUsers();
  const profilePaths = users
    .filter(u => u && u.id)
    .map(u => '/profile.html?user=' + encodeURIComponent(u.id));

  const allUrls = Array.from(new Set([...corePaths, ...quizPaths, ...takeQuizPaths, ...profilePaths]));
  const xmlEntries = allUrls
    .map(pathname => `<url><loc>${escapeXml(baseUrl + pathname)}</loc></url>`)
    .join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>`
    + `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`
    + xmlEntries
    + `</urlset>`;

  res.type('application/xml').send(xml);
});

app.get('/share/:id', async (req, res) => {
  const data = await readData();
  const quiz = data.find(item => item.id === req.params.id);
  if (!quiz) return res.status(404).send('Quiz not found');

  const ratings = await readRatings();
  const users = await readUsers();

  const quizRatings = ratings.filter(r => r.quizId === quiz.id);
  const avgRating = quizRatings.length
    ? Math.round((quizRatings.reduce((sum, r) => sum + (Number(r.rating) || 0), 0) / quizRatings.length) * 10) / 10
    : null;

  const ownerUser = users.find(u => u && u.id === quiz.owner);
  const ownerName = ownerUser ? ownerUser.username : (quiz.owner || 'Unknown');
  const questionCount = Array.isArray(quiz.questions) ? quiz.questions.length : 0;
  const infoParts = [`${questionCount} question${questionCount === 1 ? '' : 's'}`];
  if (avgRating != null) infoParts.push(`${avgRating}/5 rating`);
  if (ownerName) infoParts.push(`by ${ownerName}`);

  const shortDescriptionSource = String(quiz.description || '').replace(/\s+/g, ' ').trim();
  const fallbackDescription = `Play this quiz • ${infoParts.join(' • ')}`;
  const description = (shortDescriptionSource || fallbackDescription).slice(0, 280);

  const baseUrl = getPublicBaseUrl(req);
  const sharePath = `/share/${encodeURIComponent(quiz.id)}`;
  const playPath = `/take.html?quiz=${encodeURIComponent(quiz.id)}`;
  const shareUrl = `${baseUrl}${sharePath}`;
  const imageUrl = quiz.owner
    ? `${baseUrl}/avatars/${encodeURIComponent(quiz.owner)}`
    : `${baseUrl}/default-avatar.png`;

  const title = `🧠 ${String(quiz.title || 'Quiz')}`;

  res.type('html').send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:url" content="${escapeHtml(shareUrl)}" />
  <meta property="og:image" content="${escapeHtml(imageUrl)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(title)}" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
  <meta name="twitter:image" content="${escapeHtml(imageUrl)}" />
</head>
<body>
  <p>Opening quiz…</p>
  <p><a href="${escapeHtml(playPath)}">Continue to quiz</a></p>
  <script>window.location.replace(${JSON.stringify(playPath)});</script>
</body>
</html>`);
});

app.get('/api/quizzes', async (req, res) => {
  const data = await readData();
  const ratings = await readRatings();
  const results = await readResults();
  const q = req.query.search ? req.query.search.toLowerCase() : null;
  const list = data.filter(item => {
    if (!q) return true;
    const inTitle = item.title && item.title.toLowerCase().includes(q);
    const inDesc = item.description && item.description.toLowerCase().includes(q);
    return inTitle || inDesc;
  }).map(item => {
    const itemRatings = ratings.filter(r => r.quizId === item.id);
    const itemResults = results.filter(r => r.quizId === item.id);
    const avg = itemRatings.length ? Math.round(itemRatings.reduce((s, r) => s + r.rating, 0) / itemRatings.length * 10) / 10 : null;
    const avgScore = itemResults.length
      ? Math.round(itemResults.reduce((s, r) => s + (Number(r.score) || 0), 0) / itemResults.length)
      : null;
    const submissions = itemResults.length;
    const ratingForScore = avg == null ? 0 : avg;
    const averageQuizScoreForScore = avgScore == null ? 0 : (avgScore / 100);
    const computedScore = (ratingForScore * 2) + (averageQuizScoreForScore * 10) + Math.log10(submissions + 1);
    const score = Math.round(computedScore * 100) / 100;
    return {
      id: item.id,
      title: item.title,
      owner: item.owner || null,
      description: item.description || '',
      averageRating: avg,
      averageScore: avgScore,
      submissions,
      score
    };
  });
  res.json(list);
});

app.get('/api/quizzes/:id', async (req, res) => {
  const data = await readData();
  const q = data.find(item => item.id === req.params.id);
  if (!q) return res.status(404).json({ error: 'Not found' });
  // include ratings summary
  const ratings = await readRatings();
  const results = await readResults();
  const itemRatings = ratings.filter(r => r.quizId === q.id);
  const itemResults = results.filter(r => r.quizId === q.id);
  const avg = itemRatings.length ? Math.round(itemRatings.reduce((s, r) => s + r.rating, 0) / itemRatings.length * 10) / 10 : null;
  const avgScore = itemResults.length
    ? Math.round(itemResults.reduce((s, r) => s + (Number(r.score) || 0), 0) / itemResults.length)
    : null;
  const submissions = itemResults.length;
  const ratingForScore = avg == null ? 0 : avg;
  const averageQuizScoreForScore = avgScore == null ? 0 : (avgScore / 100);
  const computedScore = (ratingForScore * 2) + (averageQuizScoreForScore * 10) + Math.log10(submissions + 1);
  const score = Math.round(computedScore * 100) / 100;
  res.json(Object.assign({}, sanitizeQuizForPublic(q), {
    averageRating: avg,
    ratingsCount: itemRatings.length,
    averageScore: avgScore,
    submissions,
    score
  }));
});

app.get('/api/quizzes/:id/edit', async (req, res) => {
  const authUser = getAuthUser(req);
  if (!authUser) return res.status(401).json({ error: 'Unauthorized' });
  const data = await readData();
  const q = data.find(item => item.id === req.params.id);
  if (!q) return res.status(404).json({ error: 'Not found' });
  const canModerate = await isModerator(authUser.id);
  if (!canModerate && q.owner && q.owner !== authUser.id) return res.status(403).json({ error: 'Forbidden' });
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
  const canModerate = await isModerator(authUser.id);
  if (!canModerate && data[idx].owner && data[idx].owner !== authUser.id) return res.status(403).json({ error: 'Forbidden' });
  data[idx].title = title;
  data[idx].questions = questions;
  data[idx].owner = data[idx].owner || authUser.id;
  data[idx].description = description || data[idx].description || '';
  data[idx].showQuestionResults = !!showQuestionResults;
  data[idx].showCorrectAnswersForIncorrect = !!showCorrectAnswersForIncorrect;
  await writeData(data);
  res.json({ ok: true });
});

app.delete('/api/quizzes/:id', async (req, res) => {
  const authUser = getAuthUser(req);
  if (!authUser) return res.status(401).json({ error: 'Unauthorized' });

  const data = await readData();
  const idx = data.findIndex(item => item.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });

  const quiz = data[idx];
  const canModerate = await isModerator(authUser.id);
  const isOwner = quiz.owner && quiz.owner === authUser.id;
  if (!canModerate && !isOwner) return res.status(403).json({ error: 'Forbidden' });

  data.splice(idx, 1);
  await writeData(data);

  const results = await readResults();
  await writeResults(results.filter(r => r.quizId !== req.params.id));

  const ratings = await readRatings();
  await writeRatings(ratings.filter(r => r.quizId !== req.params.id));

  res.json({ ok: true });
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
  const roles = await getRolesForUser(req.params.id);
  res.json({ userId: req.params.id, quizCount: count, averageScore: avg, roles });
});

app.get('/api/users/:id/settings', async (req, res) => {
  const authUser = getAuthUser(req);
  if (!authUser || authUser.id !== req.params.id) return res.status(403).json({ error: 'Forbidden' });

  const store = await readSettingsStore();
  const raw = store[req.params.id] && typeof store[req.params.id] === 'object' ? store[req.params.id] : {};
  res.json(normalizeUserSettings(raw));
});

app.put('/api/users/:id/settings', async (req, res) => {
  const authUser = getAuthUser(req);
  if (!authUser || authUser.id !== req.params.id) return res.status(403).json({ error: 'Forbidden' });

  const next = normalizeUserSettings(req.body || {});
  const store = await readSettingsStore();
  store[req.params.id] = next;
  await writeSettingsStore(store);
  res.json(next);
});

app.delete('/api/users/:id', async (req, res) => {
  const authUser = getAuthUser(req);
  if (!authUser) return res.status(401).json({ error: 'Unauthorized' });

  const targetUserId = req.params.id;
  const isCallerAdmin = await isAdmin(authUser.id);
  const isSelfDelete = authUser.id === targetUserId;
  if (!isCallerAdmin && !isSelfDelete) return res.status(403).json({ error: 'Forbidden' });

  const users = await readUsers();
  const userIdx = users.findIndex(u => u.id === targetUserId);
  if (userIdx === -1) return res.status(404).json({ error: 'User not found' });

  users.splice(userIdx, 1);
  await writeUsers(users);

  const quizzes = await readData();
  const removedQuizIds = quizzes.filter(q => q.owner === targetUserId).map(q => q.id);
  const remainingQuizzes = quizzes.filter(q => q.owner !== targetUserId);
  await writeData(remainingQuizzes);

  const results = await readResults();
  const remainingResults = results.filter(r => r.userId !== targetUserId && !removedQuizIds.includes(r.quizId));
  await writeResults(remainingResults);

  const ratings = await readRatings();
  const remainingRatings = ratings.filter(r => r.userId !== targetUserId && !removedQuizIds.includes(r.quizId));
  await writeRatings(remainingRatings);

  const roles = await readRoles();
  roles.admin = (Array.isArray(roles.admin) ? roles.admin : []).filter(id => id !== targetUserId);
  roles.moderator = (Array.isArray(roles.moderator) ? roles.moderator : []).filter(id => id !== targetUserId);
  await fs.writeFile(ROLES_FILE, JSON.stringify(roles, null, 2), 'utf8');

  const settingsStore = await readSettingsStore();
  if (settingsStore[targetUserId]) {
    delete settingsStore[targetUserId];
    await writeSettingsStore(settingsStore);
  }

  try {
    const extList = ['.png', '.webp', '.jpg', '.jpeg', '.gif'];
    for (const ext of extList) {
      const avatarPath = path.join(UPLOAD_DIR, targetUserId + ext);
      if (fsSync.existsSync(avatarPath)) fsSync.unlinkSync(avatarPath);
    }
  } catch (err) {}

  res.json({ ok: true, deletedUserId: targetUserId, deletedQuizCount: removedQuizIds.length });
});

app.get('/avatars/:id', (req, res) => {
  const avatarFile = resolveAvatarFileForUser(req.params.id);
  res.set('Cache-Control', 'no-cache');
  res.sendFile(avatarFile);
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

app.get('/api/quizzes/:id/results', async (req, res) => {
  const authUser = getAuthUser(req);
  if (!authUser) return res.status(401).json({ error: 'Unauthorized' });

  const data = await readData();
  const quiz = data.find(item => item.id === req.params.id);
  if (!quiz) return res.status(404).json({ error: 'Not found' });

  const canModerate = await isModerator(authUser.id);
  const isOwner = !!quiz.owner && quiz.owner === authUser.id;
  if (!canModerate && !isOwner) return res.status(403).json({ error: 'Forbidden' });

  const results = await readResults();
  const quizResults = results
    .filter(r => r.quizId === req.params.id)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .map(r => ({
      id: r.id,
      quizId: r.quizId,
      userId: r.userId || null,
      score: Number(r.score) || 0,
      correct: Number.isFinite(Number(r.raw)) ? Number(r.raw) : 0,
      total: Number(r.totalQuestions) || 0,
      timestamp: r.timestamp
    }));

  res.json(quizResults);
});

app.get('/api/quizzes/:id/results/:resultId', async (req, res) => {
  const authUser = getAuthUser(req);
  if (!authUser) return res.status(401).json({ error: 'Unauthorized' });

  const data = await readData();
  const quiz = data.find(item => item.id === req.params.id);
  if (!quiz) return res.status(404).json({ error: 'Not found' });

  const canModerate = await isModerator(authUser.id);
  const isOwner = !!quiz.owner && quiz.owner === authUser.id;
  if (!canModerate && !isOwner) return res.status(403).json({ error: 'Forbidden' });

  const results = await readResults();
  const result = results.find(r => r.id === req.params.resultId && r.quizId === req.params.id);
  if (!result) return res.status(404).json({ error: 'Result not found' });

  res.json({
    id: result.id,
    quizId: result.quizId,
    userId: result.userId || null,
    score: Number(result.score) || 0,
    correct: Number.isFinite(Number(result.raw)) ? Number(result.raw) : 0,
    total: Number(result.totalQuestions) || 0,
    timestamp: result.timestamp,
    answers: Array.isArray(result.answers) ? result.answers : []
  });
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
  const hasSslPaths = !!(SSL_KEY_PATH && SSL_CERT_PATH);
  const hasSslFiles = hasSslPaths && fsSync.existsSync(SSL_KEY_PATH) && fsSync.existsSync(SSL_CERT_PATH);

  if (!hasSslFiles) {
    if (hasSslPaths) {
      console.warn('HTTPS cert/key paths configured but files were not found. Falling back to HTTP.');
    }
    app.listen(PORT, () => console.log(`Server running on http://0.0.0.0:${PORT}`));
    return;
  }

  const httpsOptions = {
    key: fsSync.readFileSync(SSL_KEY_PATH),
    cert: fsSync.readFileSync(SSL_CERT_PATH)
  };
  if (SSL_CA_PATH && fsSync.existsSync(SSL_CA_PATH)) {
    httpsOptions.ca = fsSync.readFileSync(SSL_CA_PATH);
  }

  https.createServer(httpsOptions, app).listen(HTTPS_PORT, () => {
    console.log(`Server running on https://0.0.0.0:${HTTPS_PORT}`);
  });

  if (String(process.env.ENABLE_HTTP_REDIRECT || 'true').toLowerCase() !== 'false') {
    http.createServer((req, res) => {
      const hostHeader = req.headers.host || `localhost:${HTTP_REDIRECT_PORT}`;
      const host = hostHeader.split(':')[0];
      const location = `https://${host}:${HTTPS_PORT}${req.url || '/'}`;
      res.writeHead(301, { Location: location });
      res.end();
    }).listen(HTTP_REDIRECT_PORT, () => {
      console.log(`HTTP redirect server running on http://localhost:${HTTP_REDIRECT_PORT} -> https://localhost:${HTTPS_PORT}`);
    });
  }
});
