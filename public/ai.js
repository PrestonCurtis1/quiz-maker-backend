(function () {
  function byId(id) {
    return document.getElementById(id);
  }

  function capitalizeWords(text) {
    return (text || '').split(/\s+/).filter(Boolean).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

  function extractQuestionCount(prompt) {
    const text = (prompt || '').trim();
    if (!text) return 6;
    const numbers = [];
    let current = '';
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch >= '0' && ch <= '9') {
        current += ch;
      } else if (current) {
        numbers.push(parseInt(current, 10));
        current = '';
      }
    }
    if (current) numbers.push(parseInt(current, 10));
    const candidate = numbers.find(n => Number.isFinite(n) && n >= 3 && n <= 20);
    if (!Number.isFinite(candidate)) return 6;
    return candidate;
  }

  function tokenizeAlphaNumeric(text, minLength = 4) {
    const source = (text || '').toLowerCase();
    const out = [];
    let token = '';
    for (let i = 0; i < source.length; i++) {
      const ch = source[i];
      const isAlpha = (ch >= 'a' && ch <= 'z');
      const isNum = (ch >= '0' && ch <= '9');
      if (isAlpha || isNum || ch === '-') {
        token += ch;
      } else if (token) {
        if (token.length >= minLength) out.push(token);
        token = '';
      }
    }
    if (token && token.length >= minLength) out.push(token);
    return out;
  }

  function splitPromptSegments(rawPrompt) {
    const text = (rawPrompt || '').trim();
    if (!text) return [];
    const segments = [];
    let current = '';
    const cutChars = new Set(['\n', '.', '!', '?', ';']);
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (cutChars.has(ch)) {
        const cleaned = current.trim();
        if (cleaned) segments.push(cleaned);
        current = '';
      } else {
        current += ch;
      }
    }
    const tail = current.trim();
    if (tail) segments.push(tail);
    return segments;
  }

  function splitLines(rawText) {
    const text = rawText || '';
    const lines = [];
    let current = '';
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === '\n') {
        lines.push(current);
        current = '';
        continue;
      }
      if (ch !== '\r') current += ch;
    }
    lines.push(current);
    return lines;
  }

  function normalizeSpaces(text) {
    const source = text || '';
    let result = '';
    let prevWasSpace = false;
    for (let i = 0; i < source.length; i++) {
      const ch = source[i];
      const isSpace = ch === ' ' || ch === '\n' || ch === '\r' || ch === '\t';
      if (isSpace) {
        if (!prevWasSpace) result += ' ';
        prevWasSpace = true;
      } else {
        result += ch;
        prevWasSpace = false;
      }
    }
    return result.trim();
  }

  function extractConstraintHints(rawPrompt) {
    const segments = splitPromptSegments(rawPrompt)
      .map(s => normalizeSpaces(s))
      .filter(s => s.length >= 12);

    return {
      questionHint: segments[1] || '',
      descriptionHint: segments[2] || '',
      answerHint: segments[3] || ''
    };
  }

  function appendConstraintHint(base, hint, label) {
    const cleanedBase = normalizeSpaces(base || '');
    if (!hint) return cleanedBase;
    // Hints are guidance for generation quality only; do not inject them verbatim
    // into user-facing question/description text.
    return cleanedBase;
  }

  function extractPromptFacets(prompt) {
    const words = tokenizeAlphaNumeric(prompt || '', 4);
    const unique = [];
    const seen = new Set();
    for (const w of words) {
      if (seen.has(w)) continue;
      seen.add(w);
      unique.push(w);
      if (unique.length >= 8) break;
    }

    return unique.length ? unique.map(capitalizeWords) : ['Basics', 'Definitions', 'Applications', 'Examples'];
  }

  function inferRequestedQuestionType(rawPrompt) {
    const text = (rawPrompt || '').trim();
    if (!text) return null;

    const lines = splitLines(text).map(s => s.trim()).filter(Boolean);
    let pairLikeLines = 0;
    let optionLikeLines = 0;
    let listLikeLines = 0;

    lines.forEach(line => {
      if (line.includes('->') || line.includes('=>') || line.includes('|')) pairLikeLines++;
      if (line.includes(') ') || line.includes('. ') || line.includes('- ')) optionLikeLines++;
      if (line.startsWith('-') || line.startsWith('*') || line.startsWith('•')) listLikeLines++;
    });

    if (pairLikeLines >= 2) return 'matching';
    if (listLikeLines >= 3) return 'multi';
    if (optionLikeLines >= 3) return 'multiple';

    return null;
  }

  function parsePromptInstructions(rawPrompt) {
    const lines = splitLines(rawPrompt || '').map(s => s.trim()).filter(Boolean);
    const firstLine = lines.length ? lines[0] : (rawPrompt || '').trim();
    const promptText = rawPrompt || '';

    const requestedType = inferRequestedQuestionType(rawPrompt);
    const constraints = extractConstraintHints(rawPrompt);
    const hasDigit = promptText.split('').some(ch => ch >= '0' && ch <= '9');
    const opStats = { addition: 0, subtraction: 0, multiplication: 0, division: 0 };
    promptText.split('').forEach(ch => {
      if (ch === '+') opStats.addition++;
      else if (ch === '-') opStats.subtraction++;
      else if (ch === '*' || ch === '×') opStats.multiplication++;
      else if (ch === '/' || ch === '÷') opStats.division++;
    });
    const opTotal = opStats.addition + opStats.subtraction + opStats.multiplication + opStats.division;
    const equationQuiz = hasDigit && opTotal > 0;
    const equationInDescription = equationQuiz;
    const solveEquationText = equationQuiz;

    const preferredOperation = Object.entries(opStats).sort((a, b) => b[1] - a[1])[0][1] > 0
      ? Object.entries(opStats).sort((a, b) => b[1] - a[1])[0][0]
      : 'mixed';

    const topicLine = normalizeSpaces(firstLine);
    const topic = capitalizeWords(topicLine) || 'General Knowledge';

    return {
      topic,
      requestedType,
      constraints,
      equationInDescription,
      solveEquationText,
      equationQuiz,
      preferredOperation
    };
  }

  function normalizeKey(text) {
    return (text || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function uniqueStrings(values, maxCount) {
    const out = [];
    const seen = new Set();
    for (const value of (values || [])) {
      const cleaned = normalizeSpaces(value);
      if (!cleaned) continue;
      const key = normalizeKey(cleaned);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(cleaned);
      if (maxCount && out.length >= maxCount) break;
    }
    return out;
  }

  function titleCaseSmallPhrase(text, maxWords = 5) {
    const words = (text || '').split(/\s+/).filter(Boolean).slice(0, maxWords);
    return capitalizeWords(words.join(' '));
  }

  function extractPromptUnits(prompt, fallbackTopic) {
    const segments = uniqueStrings(splitPromptSegments(prompt), 18)
      .filter(s => s.length >= 8 && s.length <= 200);

    const tokenFreq = {};
    const tokens = tokenizeAlphaNumeric(prompt, 4);
    tokens.forEach(token => {
      tokenFreq[token] = (tokenFreq[token] || 0) + 1;
    });

    const keywordPool = Object.entries(tokenFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 16)
      .map(([w]) => titleCaseSmallPhrase(w));

    const segmentFacets = segments
      .map(s => titleCaseSmallPhrase(s, 4))
      .filter(Boolean);

    const facets = uniqueStrings([...segmentFacets, ...keywordPool], 12);

    const fallbackFacets = ['Concepts', 'Definitions', 'Examples', 'Applications'];

    return {
      topic: normalizeSpaces(fallbackTopic) || 'General Knowledge',
      facets: facets.length ? facets : fallbackFacets,
      keyIdeas: segments.length ? segments : [`Core concepts in ${fallbackTopic || 'the topic'}.`]
    };
  }

  function inferDifficulty(prompt) {
    const text = (prompt || '').trim();
    if (!text) return 'medium';
    const length = text.length;
    const lines = splitLines(text).filter(Boolean).length;
    const symbols = text.split('').filter(ch => ['+', '-', '*', '/', '×', '÷', ':'].includes(ch)).length;
    const complexity = (length / 120) + (lines * 0.4) + (symbols * 0.2);
    if (complexity < 2.5) return 'easy';
    if (complexity > 5.5) return 'hard';
    return 'medium';
  }

  function isSameFacetAsTopic(facet, topicLc) {
    return normalizeKey(facet || '') === normalizeKey(topicLc || '');
  }

  function detectTopicProfile(topicLc) {
    const key = normalizeKey(topicLc || '');
    if (!key) return null;
    if (key === 'fruit' || key === 'fruits') return 'fruits';
    const tokens = key.split(' ').filter(Boolean);
    if (tokens.includes('fruit') || tokens.includes('fruits')) return 'fruits';
    return null;
  }

  function buildTopicSpecificMultipleOptions(topicProfile, index, difficulty) {
    if (topicProfile !== 'fruits') return null;

    const trueStatements = [
      'Most fruits develop from flowers and contain seeds.',
      'Many fruits are good sources of fiber, vitamins, and water.',
      'Fruit ripeness often changes color, aroma, texture, and sweetness.'
    ];
    const nuancedTrue = [
      'Botanically, fruits form from the ovary of a flower after fertilization.',
      'Fruit structure helps protect and disperse seeds in different environments.',
      'Different fruit varieties can have very different sugar, fiber, and acid levels.'
    ];
    const falseStatements = [
      'All fruits must be cooked before they are safe to eat.',
      'Fruits contain no natural sugars.',
      'Every fruit grows only in tropical climates.',
      'Fruits are always nutritionally identical to each other.'
    ];

    const truths = difficulty === 'hard' ? nuancedTrue : trueStatements;
    const correct = truths[index % truths.length];
    const d1 = falseStatements[index % falseStatements.length];
    const d2 = falseStatements[(index + 1) % falseStatements.length];
    const d3 = falseStatements[(index + 2) % falseStatements.length];
    return [correct, d1, d2, d3];
  }

  function buildTopicSpecificMultiOptions(topicProfile) {
    if (topicProfile !== 'fruits') return null;
    return {
      options: [
        'Fruits commonly provide vitamins, minerals, and dietary fiber.',
        'All fruits have exactly the same nutrient profile.',
        'Fruit characteristics can vary by variety, climate, and ripeness.',
        'Fruits never contain natural sugars.'
      ],
      correct: [0, 2]
    };
  }

  function buildTopicSpecificMatchingPairs(topicProfile) {
    if (topicProfile !== 'fruits') return null;
    return [
      { left: 'Citrus', right: 'Orange, lemon, lime' },
      { left: 'Berry', right: 'Strawberry, blueberry, raspberry' },
      { left: 'Stone fruit', right: 'Peach, plum, cherry' }
    ];
  }

  function buildMultipleOptions(facet, topicLc, index, difficulty) {
    const topicProfile = detectTopicProfile(topicLc);
    const topicSpecific = buildTopicSpecificMultipleOptions(topicProfile, index, difficulty);
    if (topicSpecific) return topicSpecific;

    const sameFacetTopic = isSameFacetAsTopic(facet, topicLc);

    const strongTrue = sameFacetTopic
      ? [
        `Core ideas in ${topicLc} are best understood through clear categories and examples.`,
        `Understanding ${topicLc} improves when comparing examples and use cases.`,
        `Analyzing ${topicLc} with context helps build reliable understanding.`
      ]
      : [
        `${facet} helps explain core ideas in ${topicLc}.`,
        `${facet} improves understanding through examples in ${topicLc}.`,
        `${facet} is useful when analyzing ${topicLc}.`
      ];

    const nuancedTrue = sameFacetTopic
      ? [
        `Reasoning about ${topicLc} improves by balancing principles with practical context.`,
        `${topicLc} can be evaluated through multiple perspectives, not one rigid rule.`,
        `Comparing tradeoffs is a useful way to understand ${topicLc}.`
      ]
      : [
        `${facet} connects principles with practical decisions in ${topicLc}.`,
        `${facet} provides structure for reasoning about ${topicLc}.`,
        `${facet} supports comparing tradeoffs in ${topicLc}.`
      ];

    const falseClaims = sameFacetTopic
      ? [
        `${topicLc} is unrelated to real-world use.`,
        `${topicLc} has no practical value.`,
        `${topicLc} always means exactly one rigid thing.`,
        `${topicLc} replaces all other relevant ideas.`
      ]
      : [
        `${facet} is unrelated to ${topicLc}.`,
        `${facet} has no practical use in ${topicLc}.`,
        `${facet} always means exactly one rigid thing in ${topicLc}.`,
        `${facet} replaces all other ideas in ${topicLc}.`
      ];

    const truths = difficulty === 'hard' ? nuancedTrue : strongTrue;
    const correct = truths[index % truths.length];
    const d1 = falseClaims[index % falseClaims.length];
    const d2 = falseClaims[(index + 1) % falseClaims.length];
    const d3 = sameFacetTopic
      ? (difficulty === 'hard'
        ? `${topicLc} only matters for memorization, not reasoning.`
        : `${topicLc} should usually be ignored.`)
      : (difficulty === 'hard'
        ? `${facet} only matters for memorization, not reasoning, in ${topicLc}.`
        : `${facet} should usually be ignored in ${topicLc}.`);

    return [correct, d1, d2, d3];
  }

  function buildTextAnswers(facet, topicLc, hint) {
    const topicProfile = detectTopicProfile(topicLc);
    if (topicProfile === 'fruits') {
      const answers = [
        'fruits provide fiber and vitamins',
        'fruits develop from flowers and often contain seeds',
        'fruit nutrition and taste vary by type and ripeness'
      ];
      if (hint) answers.push(hint);
      return uniqueStrings(answers, 5);
    }

    const sameFacetTopic = isSameFacetAsTopic(facet, topicLc);
    const answers = sameFacetTopic
      ? [
        `${topicLc} basics`,
        `core concepts of ${topicLc}`,
        `${topicLc} applications`
      ]
      : [
        `${facet.toLowerCase()} in ${topicLc}`,
        `${facet.toLowerCase()} basics`,
        `${facet.toLowerCase()} application`
      ];
    if (hint) answers.push(hint);
    return uniqueStrings(answers, 5);
  }

  function buildEquationForNumberQuestion(index, preferredOperation) {
    const operation = preferredOperation && preferredOperation !== 'mixed'
      ? preferredOperation
      : ['addition', 'subtraction', 'multiplication', 'division'][(index - 1) % 4];

    if (operation === 'addition') {
      const a = 8 + (index % 21);
      const b = 3 + ((index * 2) % 17);
      return { equation: `${a} + ${b}`, answer: a + b };
    }

    if (operation === 'subtraction') {
      const b = 2 + (index % 14);
      const a = b + 6 + ((index * 3) % 18);
      return { equation: `${a} - ${b}`, answer: a - b };
    }

    if (operation === 'multiplication') {
      const a = 2 + (index % 12);
      const b = 2 + ((index * 2) % 10);
      return { equation: `${a} × ${b}`, answer: a * b };
    }

    const divisor = 2 + (index % 9);
    const quotient = 2 + ((index * 2) % 10);
    const dividend = divisor * quotient;
    return { equation: `${dividend} ÷ ${divisor}`, answer: quotient };
  }

  function clampNumber(value, min, max, fallback) {
    const parsed = parseInt(value, 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(max, parsed));
  }

  function normalizeRequestedType(value) {
    const v = (value || '').toLowerCase().trim();
    if (!v) return null;
    if (v === 'mixed') return null;
    if (v.startsWith('multiple')) return 'multiple';
    if (v.startsWith('multi')) return 'multi';
    if (v.startsWith('match')) return 'matching';
    if (v.startsWith('text')) return 'text';
    if (v.startsWith('number') || v.startsWith('numeric')) return 'number';
    return null;
  }

  function normalizeDifficulty(value) {
    const v = (value || '').toLowerCase().trim();
    if (v === 'easy' || v === 'medium' || v === 'hard') return v;
    return 'medium';
  }

  function shouldAutoIncludeMath({ topic, focus, requestedType }) {
    if (requestedType === 'number') return true;

    const combined = normalizeSpaces([topic, focus].filter(Boolean).join(' ')).toLowerCase();
    if (!combined) return false;

    const mathKeywordPattern = /\b(math|mathematics|algebra|geometry|trigonometry|calculus|arithmetic|equation|equations|solve|formula|formulas|physics|chemistry|statistics|probability|percent|percentage|ratio|fraction|integer|decimal)\b/;
    if (mathKeywordPattern.test(combined)) return true;

    const equationPattern = /(?:\d\s*[+\-*/×÷=])|(?:[+\-*/×÷=]\s*\d)/;
    if (equationPattern.test(combined)) return true;

    const inferred = parsePromptInstructions(combined);
    return !!(inferred && inferred.equationQuiz);
  }

  function askDraftQuizConfig(defaults = {}) {
    return new Promise(resolve => {
      const existing = byId('ai-draft-overlay');
      if (existing) existing.remove();

      const defaultCount = Number.isFinite(defaults.defaultQuestionCount)
        ? clampNumber(defaults.defaultQuestionCount, 3, 20, 8)
        : 8;
      const defaultDifficulty = normalizeDifficulty(defaults.defaultDifficulty || 'medium');
      const openAiConfigured = (defaults.aiProvider || 'local') === 'openai' && !!normalizeSpaces(defaults.openaiApiKey || '');

      const overlay = document.createElement('div');
      overlay.id = 'ai-draft-overlay';
      overlay.className = 'ai-draft-overlay';

      const modal = document.createElement('div');
      modal.className = 'ai-draft-modal';
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');

      const title = document.createElement('h3');
      title.textContent = 'Generate Draft Quiz';

      const form = document.createElement('form');
      form.className = 'ai-draft-form';

      const topicLabel = document.createElement('label');
      topicLabel.textContent = 'Quiz topic';
      const topicInput = document.createElement('input');
      topicInput.type = 'text';
      topicInput.placeholder = 'General Knowledge';
      topicInput.value = 'General Knowledge';

      const row = document.createElement('div');
      row.className = 'ai-draft-row';

      const countWrap = document.createElement('div');
      const countLabel = document.createElement('label');
      countLabel.textContent = 'Question count (3-20)';
      const countInput = document.createElement('input');
      countInput.type = 'number';
      countInput.min = '3';
      countInput.max = '20';
      countInput.value = String(defaultCount);
      countWrap.appendChild(countLabel);
      countWrap.appendChild(countInput);

      const typeWrap = document.createElement('div');
      const typeLabel = document.createElement('label');
      typeLabel.textContent = 'Question type';
      const typeSelect = document.createElement('select');
      ['mixed', 'multiple', 'multi', 'matching', 'text', 'number'].forEach(type => {
        const opt = document.createElement('option');
        opt.value = type;
        opt.textContent = type;
        typeSelect.appendChild(opt);
      });
      typeSelect.value = 'mixed';
      typeWrap.appendChild(typeLabel);
      typeWrap.appendChild(typeSelect);

      const difficultyWrap = document.createElement('div');
      const difficultyLabel = document.createElement('label');
      difficultyLabel.textContent = 'Difficulty';
      const difficultySelect = document.createElement('select');
      ['easy', 'medium', 'hard'].forEach(level => {
        const opt = document.createElement('option');
        opt.value = level;
        opt.textContent = level;
        difficultySelect.appendChild(opt);
      });
      difficultySelect.value = defaultDifficulty;
      difficultyWrap.appendChild(difficultyLabel);
      difficultyWrap.appendChild(difficultySelect);

      row.appendChild(countWrap);
      row.appendChild(typeWrap);
      row.appendChild(difficultyWrap);

      const focusLabel = document.createElement('label');
      focusLabel.textContent = 'Focus area (optional)';
      const focusInput = document.createElement('input');
      focusInput.type = 'text';
      focusInput.placeholder = 'Optional focus';

      const generalPromptLabel = document.createElement('label');
      generalPromptLabel.textContent = 'General prompt (optional)';
      const generalPromptInput = document.createElement('textarea');
      generalPromptInput.rows = 4;
      generalPromptInput.placeholder = 'Add broader instructions for the generator (tone, coverage, style, constraints).';

      const questionHintLabel = document.createElement('label');
      questionHintLabel.textContent = 'Question style instruction (optional)';
      const questionHintInput = document.createElement('input');
      questionHintInput.type = 'text';

      const descriptionHintLabel = document.createElement('label');
      descriptionHintLabel.textContent = 'Description instruction (optional)';
      const descriptionHintInput = document.createElement('input');
      descriptionHintInput.type = 'text';

      const answerHintLabel = document.createElement('label');
      answerHintLabel.textContent = 'Answer instruction (optional)';
      const answerHintInput = document.createElement('input');
      answerHintInput.type = 'text';

      const providerWrap = document.createElement('div');
      providerWrap.className = 'ai-draft-provider';
      const providerLabel = document.createElement('label');
      providerLabel.textContent = 'Provider for this request';
      const providerSelect = document.createElement('select');
      const localOpt = document.createElement('option');
      localOpt.value = 'local';
      localOpt.textContent = 'Local AI';
      providerSelect.appendChild(localOpt);

      if (openAiConfigured) {
        const openAiOpt = document.createElement('option');
        openAiOpt.value = 'openai';
        openAiOpt.textContent = `OpenAI (${defaults.openaiModel || 'gpt-4.1-mini'})`;
        providerSelect.appendChild(openAiOpt);
        providerSelect.value = 'openai';
      } else {
        providerSelect.value = 'local';
      }

      providerWrap.appendChild(providerLabel);
      providerWrap.appendChild(providerSelect);

      const note = document.createElement('div');
      note.className = 'q-help';
      note.textContent = 'Math/equation content is auto-detected from your inputs.';

      const actions = document.createElement('div');
      actions.className = 'ai-draft-actions';
      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.textContent = 'Cancel';
      const generateBtn = document.createElement('button');
      generateBtn.type = 'submit';
      generateBtn.textContent = 'Generate Draft';
      actions.appendChild(cancelBtn);
      actions.appendChild(generateBtn);

      form.appendChild(topicLabel);
      form.appendChild(topicInput);
      form.appendChild(row);
      form.appendChild(focusLabel);
      form.appendChild(focusInput);
      form.appendChild(generalPromptLabel);
      form.appendChild(generalPromptInput);
      form.appendChild(questionHintLabel);
      form.appendChild(questionHintInput);
      form.appendChild(descriptionHintLabel);
      form.appendChild(descriptionHintInput);
      form.appendChild(answerHintLabel);
      form.appendChild(answerHintInput);
      form.appendChild(providerWrap);
      form.appendChild(note);
      form.appendChild(actions);

      modal.appendChild(title);
      modal.appendChild(form);
      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      let done = false;
      function close(result) {
        if (done) return;
        done = true;
        document.removeEventListener('keydown', onKeyDown);
        overlay.remove();
        resolve(result);
      }

      function onKeyDown(event) {
        if (event.key === 'Escape') close(null);
      }

      document.addEventListener('keydown', onKeyDown);

      overlay.addEventListener('click', event => {
        if (event.target === overlay) close(null);
      });

      cancelBtn.addEventListener('click', () => close(null));

      form.addEventListener('submit', event => {
        event.preventDefault();
        const normalizedTopic = normalizeSpaces(topicInput.value) || 'General Knowledge';
        const normalizedFocus = normalizeSpaces(focusInput.value || '');
        const normalizedGeneralPrompt = normalizeSpaces(generalPromptInput.value || '');
        const requestedType = normalizeRequestedType(typeSelect.value);
        const includeMath = shouldAutoIncludeMath({
          topic: normalizedTopic,
          focus: normalizeSpaces([normalizedFocus, normalizedGeneralPrompt].filter(Boolean).join(' ')),
          requestedType
        });

        close({
          topic: normalizedTopic,
          questionCount: clampNumber(countInput.value, 3, 20, 8),
          requestedType,
          difficulty: normalizeDifficulty(difficultySelect.value),
          focus: normalizedFocus,
          generalPrompt: normalizedGeneralPrompt,
          includeMath,
          useOpenAi: providerSelect.value === 'openai',
          constraints: {
            questionHint: normalizeSpaces(questionHintInput.value),
            descriptionHint: normalizeSpaces(descriptionHintInput.value),
            answerHint: normalizeSpaces(answerHintInput.value)
          }
        });
      });

      setTimeout(() => topicInput.focus(), 0);
    });
  }

  function scoreQuestionQuality(question) {
    if (!question || typeof question !== 'object') return 0;
    let score = 0;

    const text = normalizeSpaces(question.text || '');
    if (text.length >= 18 && text.length <= 220) score += 2;
    if ((question.description || '').trim().length >= 12) score += 1;

    if (question.type === 'multiple' || question.type === 'multi') {
      const options = uniqueStrings(question.options || [], 10);
      if (options.length >= 4) score += 2;
      const valid = options.length;
      if (question.type === 'multiple') {
        if (Number.isInteger(question.correct) && question.correct >= 0 && question.correct < valid) score += 2;
      } else {
        const arr = Array.isArray(question.correct) ? question.correct : [];
        const allValid = arr.length >= 2 && arr.every(i => Number.isInteger(i) && i >= 0 && i < valid);
        if (allValid) score += 2;
      }
    } else if (question.type === 'text') {
      const answers = Array.isArray(question.answer)
        ? uniqueStrings(question.answer, 10)
        : uniqueStrings([question.answer], 10);
      if (answers.length >= 2) score += 2;
      if (answers.some(a => a.length >= 8)) score += 1;
    } else if (question.type === 'number') {
      const expected = Array.isArray(question.answer) ? question.answer : [question.answer];
      const numeric = expected
        .map(v => (typeof v === 'number' ? v : parseFloat(v)))
        .filter(v => Number.isFinite(v));
      if (numeric.length >= 1) score += 2;
      if (numeric.length >= 2) score += 1;
    } else if (question.type === 'matching') {
      const pairs = Array.isArray(question.pairs) ? question.pairs : [];
      if (pairs.length >= 3) score += 2;
      const lefts = uniqueStrings(pairs.map(p => p && p.left ? p.left : ''), 20);
      const rights = uniqueStrings(pairs.map(p => p && p.right ? p.right : ''), 20);
      if (lefts.length === pairs.length && rights.length === pairs.length) score += 1;
    }

    return score;
  }

  function repairQuestion(question, context, index) {
    const fallbackType = context && context.defaultType ? context.defaultType : 'multiple';
    const facet = (context && context.facets && context.facets.length)
      ? context.facets[index % context.facets.length]
      : 'Concept';
    const topicLc = (context && context.topic ? context.topic : 'general knowledge').toLowerCase();
    const difficulty = context && context.difficulty ? context.difficulty : 'medium';
    const hint = context && context.answerHint ? context.answerHint : '';
    const sameFacetTopic = isSameFacetAsTopic(facet, topicLc);
    const keyIdeas = (context && context.keyIdeas && context.keyIdeas.length)
      ? context.keyIdeas
      : [`${facet} explained in ${topicLc}`];

    const q = Object.assign({}, question || {});
    q.type = q.type || fallbackType;

    if (!normalizeSpaces(q.text || '')) {
      if (q.type === 'matching') q.text = `Match ideas related to ${facet.toLowerCase()}.`;
      else if (q.type === 'text') q.text = sameFacetTopic
        ? `Explain key ideas about ${topicLc}.`
        : `Explain ${facet.toLowerCase()} in ${topicLc}.`;
      else if (q.type === 'number') q.text = sameFacetTopic
        ? `What is a numeric value related to ${topicLc}?`
        : `What is a numeric value related to ${facet.toLowerCase()} in ${topicLc}?`;
      else q.text = sameFacetTopic
        ? `Which statement best describes ${topicLc}?`
        : `Which statement best describes ${facet.toLowerCase()} in ${topicLc}?`;
    }

    if (q.type === 'matching') {
      const pairs = Array.isArray(q.pairs) ? q.pairs : [];
      const cleanedPairs = pairs
        .map(p => ({ left: normalizeSpaces((p && p.left) || ''), right: normalizeSpaces((p && p.right) || '') }))
        .filter(p => p.left && p.right);

      while (cleanedPairs.length < 3) {
        const n = cleanedPairs.length;
        cleanedPairs.push({
          left: `${facet} point ${n + 1}`,
          right: normalizeSpaces(keyIdeas[(index + n) % keyIdeas.length] || `${facet} in ${topicLc}`)
        });
      }
      q.pairs = cleanedPairs.slice(0, 6);
      q.description = normalizeSpaces(q.description || '');
      return q;
    }

    if (q.type === 'text') {
      const answers = Array.isArray(q.answer) ? q.answer : [q.answer];
      const merged = uniqueStrings([...answers, ...buildTextAnswers(facet, topicLc, hint)], 6);
      q.answer = merged.length > 1
        ? merged
        : [merged[0] || (sameFacetTopic ? `${topicLc} basics` : `${facet.toLowerCase()} in ${topicLc}`)];
      q.description = normalizeSpaces(q.description || '');
      return q;
    }

    if (q.type === 'number') {
      const existing = Array.isArray(q.answer) ? q.answer : [q.answer];
      const parsed = existing
        .map(value => (typeof value === 'number' ? value : parseFloat(value)))
        .filter(value => Number.isFinite(value));
      const base = 5 + ((index * 3) % 17);
      const numericAnswers = parsed.length ? parsed : [base, base + 0.5];
      q.answer = numericAnswers.length === 1 ? numericAnswers[0] : numericAnswers;
      q.description = normalizeSpaces(q.description || 'Enter a number.');
      return q;
    }

    const normalizedOptions = uniqueStrings(Array.isArray(q.options) ? q.options : [], 10).slice(0, 4);
    if (q.type === 'multiple') {
      const existingCorrect = Number.isInteger(q.correct) ? q.correct : parseInt(q.correct, 10);
      const validExisting = normalizedOptions.length >= 4
        && Number.isInteger(existingCorrect)
        && existingCorrect >= 0
        && existingCorrect < normalizedOptions.length;
      if (validExisting) {
        q.options = normalizedOptions;
        q.correct = existingCorrect;
        q.description = normalizeSpaces(q.description || '');
        return q;
      }
    }

    if (q.type === 'multi') {
      const existingCorrect = (Array.isArray(q.correct) ? q.correct : [])
        .map(v => parseInt(v, 10))
        .filter(v => Number.isInteger(v) && v >= 0 && v < normalizedOptions.length);
      const uniqueCorrect = Array.from(new Set(existingCorrect));
      const validExisting = normalizedOptions.length >= 4 && uniqueCorrect.length >= 1;
      if (validExisting) {
        q.options = normalizedOptions;
        q.correct = uniqueCorrect;
        q.description = normalizeSpaces(q.description || '');
        return q;
      }
    }

    const rebuiltOptions = buildMultipleOptions(facet, topicLc, index, difficulty);
    const candidateOptions = uniqueStrings([...(Array.isArray(q.options) ? q.options : []), ...rebuiltOptions], 8);
    while (candidateOptions.length < 4) {
      candidateOptions.push(sameFacetTopic
        ? `Additional statement ${candidateOptions.length + 1} about ${topicLc}.`
        : `Additional statement ${candidateOptions.length + 1} about ${facet.toLowerCase()} in ${topicLc}.`);
    }
    q.options = candidateOptions.slice(0, 4);

    if (q.type === 'multi') {
      q.correct = [0, 2].filter(i => i < q.options.length);
    } else {
      q.type = 'multiple';
      q.correct = 0;
    }
    q.description = normalizeSpaces(q.description || '');
    return q;
  }

  function optimizeQuizQuestions(questions, context) {
    const input = Array.isArray(questions) ? questions : [];
    const upgraded = input.map((q, i) => {
      const initial = repairQuestion(q, context, i);
      const score = scoreQuestionQuality(initial);
      if (score >= 5) return initial;
      return repairQuestion(initial, context, i + 1);
    });

    const seenText = new Map();
    upgraded.forEach((q, i) => {
      const base = normalizeSpaces(q.text || `Question ${i + 1}`) || `Question ${i + 1}`;
      const key = normalizeKey(base);
      const count = seenText.get(key) || 0;
      seenText.set(key, count + 1);
      if (count > 0) q.text = `${base} (Variant ${count + 1})`;

      if (q.type === 'multiple' || q.type === 'multi') {
        q.options = (Array.isArray(q.options) ? q.options : [])
          .map(value => normalizeSpaces(value))
          .filter(Boolean)
          .slice(0, 4);
        while (q.options.length < 4) {
          q.options.push(`Additional option ${q.options.length + 1}.`);
        }
        if (q.type === 'multiple') {
          const existingCorrect = Number.isInteger(q.correct) ? q.correct : parseInt(q.correct, 10);
          q.correct = (Number.isInteger(existingCorrect) && existingCorrect >= 0 && existingCorrect < q.options.length)
            ? existingCorrect
            : 0;
        } else {
          const existingCorrect = (Array.isArray(q.correct) ? q.correct : [])
            .map(v => parseInt(v, 10))
            .filter(v => Number.isInteger(v) && v >= 0 && v < q.options.length);
          const uniqueCorrect = Array.from(new Set(existingCorrect));
          q.correct = uniqueCorrect.length ? uniqueCorrect : [0, 2].filter(i => i < q.options.length);
        }
      } else if (q.type === 'text') {
        const answers = Array.isArray(q.answer) ? q.answer : [q.answer];
        const cleaned = uniqueStrings(answers, 6);
        q.answer = cleaned.length > 1 ? cleaned : [cleaned[0] || 'Core concept'];
      } else if (q.type === 'number') {
        const answers = Array.isArray(q.answer) ? q.answer : [q.answer];
        const numeric = answers
          .map(value => (typeof value === 'number' ? value : parseFloat(value)))
          .filter(value => Number.isFinite(value));
        const resolved = numeric.length ? numeric : [10];
        q.answer = resolved.length === 1 ? resolved[0] : resolved.slice(0, 4);
      } else if (q.type === 'matching') {
        const pairs = Array.isArray(q.pairs) ? q.pairs : [];
        q.pairs = pairs
          .map(p => ({ left: normalizeSpaces((p && p.left) || ''), right: normalizeSpaces((p && p.right) || '') }))
          .filter(p => p.left && p.right)
          .slice(0, 6);
      }
    });

    return upgraded;
  }

  function formatCorrectAnswerSummary(question) {
    if (!question) return '';
    if (question.type === 'multiple') {
      const options = Array.isArray(question.options) ? question.options : [];
      const correctIndex = Number.isInteger(question.correct) ? question.correct : 0;
      const label = options[correctIndex] != null ? options[correctIndex] : '(missing option)';
      return `Correct option: ${correctIndex + 1}. ${label}`;
    }
    if (question.type === 'multi') {
      const options = Array.isArray(question.options) ? question.options : [];
      const correctIndices = Array.isArray(question.correct) ? question.correct : [];
      if (!correctIndices.length) return 'Correct options: (none)';
      return `Correct options: ${correctIndices.map(i => `${i + 1}. ${options[i] || '(missing option)'}`).join(' | ')}`;
    }
    if (question.type === 'matching') {
      const pairs = Array.isArray(question.pairs) ? question.pairs : [];
      return `Pairs: ${pairs.map(p => `${p.left} -> ${p.right}`).join(' ; ')}`;
    }
    if (question.type === 'number') {
      const answers = Array.isArray(question.answer) ? question.answer : [question.answer];
      return `Accepted numbers: ${answers.filter(v => v != null && v !== '').join(' | ')}`;
    }
    const answers = Array.isArray(question.answer) ? question.answer : [question.answer];
    return `Accepted answers: ${answers.filter(Boolean).join(' | ')}`;
  }

  function tryUpdateAnswersFromPrompt(question, input) {
    const raw = normalizeSpaces(input || '');
    if (!raw) return false;

    if (question.type === 'multiple') {
      const idx = parseInt(raw, 10) - 1;
      const options = Array.isArray(question.options) ? question.options : [];
      if (Number.isInteger(idx) && idx >= 0 && idx < options.length) {
        question.correct = idx;
        return true;
      }
      return false;
    }

    if (question.type === 'multi') {
      const parts = raw.split(',').map(s => parseInt(s.trim(), 10) - 1).filter(n => Number.isInteger(n));
      const options = Array.isArray(question.options) ? question.options : [];
      const valid = uniqueStrings(parts.map(String), 20)
        .map(s => parseInt(s, 10))
        .filter(i => i >= 0 && i < options.length);
      if (valid.length) {
        question.correct = valid;
        return true;
      }
      return false;
    }

    if (question.type === 'matching') {
      const chunks = raw.split(';').map(s => s.trim()).filter(Boolean);
      const pairs = [];
      chunks.forEach(chunk => {
        const arrowIndex = chunk.indexOf('->');
        if (arrowIndex <= 0) return;
        const left = normalizeSpaces(chunk.slice(0, arrowIndex));
        const right = normalizeSpaces(chunk.slice(arrowIndex + 2));
        if (left && right) pairs.push({ left, right });
      });
      if (pairs.length) {
        question.pairs = pairs;
        return true;
      }
      return false;
    }

    if (question.type === 'number') {
      const values = raw.split(',')
        .map(s => parseFloat(s.trim()))
        .filter(v => Number.isFinite(v));
      if (!values.length) return false;
      question.answer = values.length === 1 ? values[0] : values;
      return true;
    }

    const answers = raw.split(',').map(s => normalizeSpaces(s)).filter(Boolean);
    if (!answers.length) return false;
    question.answer = answers.length === 1 ? answers[0] : answers;
    return true;
  }

  function reviewQuizWithPrompts(quiz) {
    if (!quiz || !Array.isArray(quiz.questions)) return quiz;

    for (let i = 0; i < quiz.questions.length; i++) {
      const q = quiz.questions[i];
      const header = `Question ${i + 1}/${quiz.questions.length} (${q.type || 'multiple'})`;
      const questionPreview = `${header}\n\n${q.text || ''}${q.description ? `\n\nDescription: ${q.description}` : ''}`;
      const questionOk = window.confirm(`${questionPreview}\n\nIs this question OK?`);

      if (!questionOk) {
        const editedText = window.prompt('Edit question text:', q.text || '');
        if (editedText !== null && normalizeSpaces(editedText)) q.text = normalizeSpaces(editedText);
        if (q.description != null) {
          const editedDesc = window.prompt('Edit description (optional):', q.description || '');
          if (editedDesc !== null) q.description = normalizeSpaces(editedDesc);
        }
      }

      const answerSummary = formatCorrectAnswerSummary(q);
      const answersOk = window.confirm(`${header}\n\n${answerSummary}\n\nAre the answer(s) OK?`);
      if (!answersOk) {
        let instructions = 'Enter updated answers:';
        if (q.type === 'multiple') instructions = 'Enter the correct option number (e.g., 2):';
        else if (q.type === 'multi') instructions = 'Enter correct option numbers separated by commas (e.g., 1,3):';
        else if (q.type === 'matching') instructions = 'Enter pairs using format left -> right; left2 -> right2';
        else if (q.type === 'number') instructions = 'Enter accepted number(s) separated by commas (e.g., 12, 12.5):';
        else instructions = 'Enter accepted answers separated by commas:';

        const editedAnswers = window.prompt(instructions, '');
        if (editedAnswers !== null) {
          const updated = tryUpdateAnswersFromPrompt(q, editedAnswers);
          if (!updated) {
            window.alert('Could not parse that input, keeping previous answer(s).');
          }
        }
      }
    }

    return quiz;
  }

  function buildLocalQuizFromPrompt(rawPrompt, overrides = {}) {
    const prompt = (rawPrompt || '').trim();
    const rules = parsePromptInstructions(prompt);
    const mergedConstraints = Object.assign({}, rules.constraints || {}, overrides.constraints || {});
    const effectiveRules = {
      topic: normalizeSpaces(overrides.topic || rules.topic),
      requestedType: overrides.requestedType || rules.requestedType,
      constraints: mergedConstraints,
      equationInDescription: typeof overrides.includeMath === 'boolean' ? overrides.includeMath : rules.equationInDescription,
      solveEquationText: typeof overrides.includeMath === 'boolean' ? overrides.includeMath : rules.solveEquationText,
      equationQuiz: typeof overrides.includeMath === 'boolean' ? overrides.includeMath : rules.equationQuiz,
      preferredOperation: rules.preferredOperation
    };

    const units = extractPromptUnits(prompt, effectiveRules.topic);
    const topic = normalizeSpaces(overrides.topic || units.topic || effectiveRules.topic);
    const questionCount = Number.isFinite(overrides.questionCount)
      ? clampNumber(overrides.questionCount, 3, 20, 8)
      : extractQuestionCount(prompt);
    const facets = units.facets.length ? units.facets : extractPromptFacets(prompt);
    const difficulty = normalizeDifficulty(overrides.difficulty || inferDifficulty(prompt));

    function chooseQuestionType(index) {
      if (effectiveRules.requestedType) return effectiveRules.requestedType;
      const rotation = effectiveRules.equationQuiz
        ? ['multiple', 'multi', 'text', 'matching', 'number']
        : ['multiple', 'multi', 'text', 'matching'];
      return rotation[(index - 1) % rotation.length];
    }

    const mcStems = [
      `Which statement best explains %TOPIC%?`,
      `What is a key idea behind %TOPIC%?`,
      `Which option is most accurate about %TOPIC%?`,
      `What does %TOPIC% mainly focus on?`
    ];
    const multiStems = [
      `Which statements about %TOPIC% are likely true?`,
      `Select all accurate points about %TOPIC%.`,
      `Which ideas are valid for %TOPIC%?`
    ];
    const textStems = [
      `In your own words, explain %FACET% in %TOPIC%.`,
      `Write a short definition of %FACET% for %TOPIC%.`,
      `Briefly describe why %FACET% matters in %TOPIC%.`
    ];
    const matchStems = [
      `Match each %TOPIC% term with the best meaning.`,
      `Match the %TOPIC% items to their descriptions.`
    ];

    const questions = [];
    const seenQuestionText = new Set();
    for (let i = 1; i <= questionCount; i++) {
      const facet = facets[(i - 1) % facets.length];
      const topicLc = topic.toLowerCase();
      const typeForThisQuestion = chooseQuestionType(i);

      function ensureUniqueText(textBase) {
        let candidate = normalizeSpaces(textBase);
        let suffix = 2;
        while (seenQuestionText.has(candidate.toLowerCase())) {
          candidate = `${textBase} (${suffix})`;
          suffix++;
        }
        seenQuestionText.add(candidate.toLowerCase());
        return candidate;
      }

      if (typeForThisQuestion === 'matching') {
        const topicProfile = detectTopicProfile(topicLc);
        const stem = matchStems[(i - 1) % matchStems.length].replaceAll('%TOPIC%', topicLc);
        const sameFacetTopic = isSameFacetAsTopic(facet, topicLc);
        const topicSpecificPairs = buildTopicSpecificMatchingPairs(topicProfile);
        const ideaA = units.keyIdeas[(i - 1) % units.keyIdeas.length] || (sameFacetTopic
          ? `A core concept in ${topicLc}`
          : `${facet} explained in ${topicLc}`);
        const ideaB = units.keyIdeas[(i + 1) % units.keyIdeas.length] || (sameFacetTopic
          ? `An example related to ${topicLc}`
          : `Example of ${facet.toLowerCase()} in ${topicLc}`);
        const ideaC = units.keyIdeas[(i + 2) % units.keyIdeas.length] || (sameFacetTopic
          ? `A common misunderstanding about ${topicLc}`
          : `Common misunderstanding of ${facet.toLowerCase()} in ${topicLc}`);
        questions.push({
          type: 'matching',
          text: ensureUniqueText(appendConstraintHint(stem, effectiveRules.constraints.questionHint)),
          description: appendConstraintHint('', effectiveRules.constraints.descriptionHint),
          pairs: topicSpecificPairs || [
            { left: `${facet} principle`, right: ideaA },
            { left: `${facet} example`, right: ideaB },
            { left: `${facet} misconception`, right: ideaC }
          ]
        });
        continue;
      }

      if (typeForThisQuestion === 'multi') {
        const topicProfile = detectTopicProfile(topicLc);
        const stem = multiStems[(i - 1) % multiStems.length].replaceAll('%TOPIC%', topicLc);
        const sameFacetTopic = isSameFacetAsTopic(facet, topicLc);
        const topicSpecificMulti = buildTopicSpecificMultiOptions(topicProfile);
        const options = topicSpecificMulti
          ? topicSpecificMulti.options
          : sameFacetTopic
          ? [
            `${topicLc} can be understood better through comparison and examples.`,
            `${topicLc} always has only one fixed interpretation.`,
            `Understanding ${topicLc} can improve with practice and feedback.`,
            `${topicLc} is mostly unrelated to real scenarios.`
          ]
          : [
            `${facet} supports better reasoning in ${topicLc}.`,
            `${facet} always has only one fixed interpretation in ${topicLc}.`,
            `${facet} can be improved through practice and feedback in ${topicLc}.`,
            `${facet} is mostly unrelated to real scenarios in ${topicLc}.`
          ];
        questions.push({
          type: 'multi',
          text: ensureUniqueText(appendConstraintHint(stem, effectiveRules.constraints.questionHint)),
          description: appendConstraintHint('Select all that apply.', effectiveRules.constraints.descriptionHint),
          options,
          correct: topicSpecificMulti ? topicSpecificMulti.correct : [0, 2]
        });
        continue;
      }

      if (typeForThisQuestion === 'text') {
        const sameFacetTopic = isSameFacetAsTopic(facet, topicLc);
        const stem = sameFacetTopic
          ? [
            `In your own words, explain key ideas about ${topicLc}.`,
            `Write a short definition of core concepts in ${topicLc}.`,
            `Briefly describe why ${topicLc} matters.`
          ][(i - 1) % 3]
          : textStems[(i - 1) % textStems.length]
            .replaceAll('%FACET%', facet.toLowerCase())
            .replaceAll('%TOPIC%', topicLc);
        const equationDesc = effectiveRules.equationInDescription ? `Equation to solve: ${i + 2} × ${i + 3}` : '';
        questions.push({
          type: 'text',
          text: ensureUniqueText(appendConstraintHint(effectiveRules.solveEquationText ? 'Solve the equation.' : stem, effectiveRules.constraints.questionHint)),
          description: appendConstraintHint(equationDesc, effectiveRules.constraints.descriptionHint),
          answer: buildTextAnswers(facet, topicLc, effectiveRules.constraints.answerHint)
        });
        continue;
      }

      if (typeForThisQuestion === 'number') {
        const sameFacetTopic = isSameFacetAsTopic(facet, topicLc);
        const generatedEquation = buildEquationForNumberQuestion(i, effectiveRules.preferredOperation);
        const numericSeed = 10 + ((i * 7) % 31);
        const accepted = effectiveRules.equationQuiz
          ? [generatedEquation.answer]
          : [numericSeed, numericSeed + 0.5];
        questions.push({
          type: 'number',
          text: ensureUniqueText(effectiveRules.equationQuiz
            ? 'Solve the equation.'
            : (sameFacetTopic
              ? `Enter a numeric answer related to ${topicLc}.`
              : `Enter a numeric answer for ${facet.toLowerCase()} in ${topicLc}.`)),
          description: effectiveRules.equationQuiz
            ? generatedEquation.equation
            : 'Numeric response required.',
          answer: accepted.length === 1 ? accepted[0] : accepted
        });
        continue;
      }

      const stem = mcStems[(i - 1) % mcStems.length].replaceAll('%TOPIC%', topicLc);
      const options = buildMultipleOptions(facet, topicLc, i - 1, difficulty);

      questions.push({
        type: 'multiple',
        text: ensureUniqueText(appendConstraintHint(stem, effectiveRules.constraints.questionHint)),
        description: appendConstraintHint('', effectiveRules.constraints.descriptionHint),
        options,
        correct: 0
      });
    }

    const optimizedQuestions = optimizeQuizQuestions(questions, {
      topic,
      facets,
      keyIdeas: units.keyIdeas,
      difficulty,
      answerHint: effectiveRules.constraints.answerHint,
      defaultType: effectiveRules.requestedType || 'multiple'
    });

    return {
      title: `${topic} Quiz (Draft)`,
      description: `Draft generated from prompt: ${prompt}\n\nReview and edit wording/answers before publishing.`,
      showQuestionResults: true,
      showCorrectAnswersForIncorrect: false,
      questions: optimizedQuestions
    };
  }

  function createTextSummaryParts(rawText) {
    const cleaned = (rawText || '').replace(/\s+/g, ' ').trim();
    const sentenceCandidates = cleaned
      .split(/(?<=[.!?])\s+/)
      .map(s => s.trim())
      .filter(s => s.length >= 40 && s.length <= 220);

    const unique = [];
    const seen = new Set();
    for (const s of sentenceCandidates) {
      const key = s.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(s);
      if (unique.length >= 60) break;
    }
    return unique;
  }

  function keywordCandidates(rawText) {
    const stop = new Set(['about','which','their','there','these','those','where','when','what','from','into','with','have','this','that','also','than','then','will','they','them','each','such','using','used','your','you','for','and','the','are','was','were','has','had','can','not','but','how']);
    const tokens = (rawText || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
      .filter(w => w.length >= 5 && !stop.has(w));

    const counts = {};
    tokens.forEach(t => { counts[t] = (counts[t] || 0) + 1; });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([w]) => w);
  }

  function buildLocalQuizFromStudyText(rawText, fileName) {
    const nameBase = (fileName || 'Study Guide').replace(/\.pdf$/i, '').trim();
    const topic = capitalizeWords(nameBase) || 'Study Guide';
    const sentences = createTextSummaryParts(rawText);
    const keywords = keywordCandidates(rawText);

    const pool = sentences.length ? sentences : [
      `This study guide discusses core concepts in ${topic}.`,
      `${topic} includes important definitions and examples.`,
      `Reviewing ${topic} works best with practice questions.`
    ];

    const targetCount = Math.max(5, Math.min(12, Math.floor(pool.length / 2) || 6));
    const questions = [];
    const studyMcStems = [
      'According to the study guide, which statement is most accurate?',
      'Which statement is best supported by the study guide?',
      'Based on the study guide, which option is most correct?',
      'Which claim aligns best with the study guide content?'
    ];

    for (let i = 0; i < targetCount; i++) {
      if (i % 5 === 4 && keywords.length >= 3) {
        const k0 = keywords[(i + 0) % keywords.length];
        const k1 = keywords[(i + 1) % keywords.length];
        const k2 = keywords[(i + 2) % keywords.length];
        questions.push({
          type: 'matching',
          text: 'Match each key term from the study guide to its description.',
          description: '',
          pairs: [
            { left: capitalizeWords(k0), right: `Related concept in ${topic}` },
            { left: capitalizeWords(k1), right: `Important detail in ${topic}` },
            { left: capitalizeWords(k2), right: `Common exam topic in ${topic}` }
          ]
        });
        continue;
      }

      if (i % 4 === 3 && keywords.length) {
        const kw = keywords[i % keywords.length];
        questions.push({
          type: 'text',
          text: `In your own words, explain why ${kw} matters in ${topic.toLowerCase()}.`,
          description: 'Keep your answer short and specific.',
          answer: [kw, `${kw} is important`]
        });
        continue;
      }

      const correctLine = pool[i % pool.length];
      const distractor1 = pool[(i + 3) % pool.length];
      const distractor2 = pool[(i + 7) % pool.length];
      const distractor3 = `A claim not supported by the ${topic} study guide.`;

      questions.push({
        type: 'multiple',
        text: studyMcStems[i % studyMcStems.length],
        description: '',
        options: [correctLine, distractor1, distractor2, distractor3],
        correct: 0
      });
    }

    const optimizedQuestions = optimizeQuizQuestions(questions, {
      topic,
      facets: keywords.length ? keywords.map(capitalizeWords) : ['Core Concepts', 'Examples', 'Definitions'],
      keyIdeas: pool,
      difficulty: 'medium',
      answerHint: '',
      defaultType: 'multiple'
    });

    return {
      title: `${topic} Quiz (Draft)`,
      description: `Draft generated from study guide PDF: ${fileName || 'uploaded file'}\n\nReview and edit wording/answers before publishing.`,
      showQuestionResults: true,
      showCorrectAnswersForIncorrect: false,
      questions: optimizedQuestions
    };
  }

  async function extractTextFromPdfFile(file) {
    if (!file) throw new Error('No file selected');
    if (typeof pdfjsLib === 'undefined') throw new Error('PDF reader is not loaded');
    if (pdfjsLib && pdfjsLib.GlobalWorkerOptions) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
    }

    const buffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
    const pdf = await loadingTask.promise;
    const maxPages = Math.min(pdf.numPages, 30);
    const parts = [];

    for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const content = await page.getTextContent();
      const pageText = content.items.map(item => item.str).join(' ');
      if (pageText.trim()) parts.push(pageText.trim());
    }

    return parts.join('\n');
  }

  function getDefaultAiSettings() {
    return {
      aiProvider: 'local',
      openaiModel: 'gpt-4.1-mini',
      openaiApiKey: '',
      reviewGeneratedQuestions: true,
      defaultDifficulty: 'medium',
      defaultQuestionCount: 8
    };
  }

  function readRuntimeAiSettings(options) {
    const defaults = getDefaultAiSettings();
    try {
      if (options && typeof options.getUserSettings === 'function') {
        const fromOption = options.getUserSettings();
        return Object.assign({}, defaults, fromOption || {});
      }

      if (typeof window.readUserSettings === 'function') {
        let userId = null;
        if (typeof window.getCurrentUser === 'function') {
          const cur = window.getCurrentUser();
          userId = cur && cur.id ? cur.id : null;
        }
        return Object.assign({}, defaults, window.readUserSettings(userId) || {});
      }
    } catch (err) {
      return defaults;
    }
    return defaults;
  }

  function shouldReviewGeneratedQuestions(settings) {
    return !!(settings && settings.reviewGeneratedQuestions);
  }

  function stripCodeFences(text) {
    const source = (text || '').trim();
    if (!source.startsWith('```')) return source;
    return source
      .replace(/^```[a-zA-Z]*\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();
  }

  function tryParseQuizJson(rawText) {
    const cleaned = stripCodeFences(rawText);
    try {
      return JSON.parse(cleaned);
    } catch (err) {
      const start = cleaned.indexOf('{');
      const end = cleaned.lastIndexOf('}');
      if (start >= 0 && end > start) {
        return JSON.parse(cleaned.slice(start, end + 1));
      }
      throw err;
    }
  }

  function normalizeAiQuestionType(value) {
    const t = (value || '').toLowerCase().trim();
    if (t === 'multiple' || t === 'multi' || t === 'matching' || t === 'text' || t === 'number') return t;
    if (t.startsWith('multiple')) return 'multiple';
    if (t.startsWith('match')) return 'matching';
    if (t.startsWith('num')) return 'number';
    return 'multiple';
  }

  function normalizeQuizFromAiDraft(draft, context) {
    const input = draft && typeof draft === 'object' ? draft : {};
    const questions = Array.isArray(input.questions) ? input.questions : [];
    const normalized = questions.map((raw, index) => {
      const q = raw && typeof raw === 'object' ? Object.assign({}, raw) : {};
      q.type = normalizeAiQuestionType(q.type || (context.requestedType || 'multiple'));

      if (q.type === 'matching') {
        const pairs = Array.isArray(q.pairs) ? q.pairs : [];
        q.pairs = pairs.map(p => ({
          left: normalizeSpaces((p && p.left) || ''),
          right: normalizeSpaces((p && p.right) || '')
        }));
        delete q.options;
        delete q.correct;
        delete q.answer;
      } else if (q.type === 'multi') {
        q.options = Array.isArray(q.options) ? q.options.map(o => normalizeSpaces(o)) : [];
        const correct = Array.isArray(q.correct) ? q.correct : [];
        q.correct = correct
          .map(v => parseInt(v, 10))
          .filter(v => Number.isInteger(v));
      } else if (q.type === 'multiple') {
        q.options = Array.isArray(q.options) ? q.options.map(o => normalizeSpaces(o)) : [];
        const correctIndex = Number.isInteger(q.correct) ? q.correct : parseInt(q.correct, 10);
        q.correct = Number.isInteger(correctIndex) ? correctIndex : 0;
      } else if (q.type === 'number') {
        const arr = Array.isArray(q.answer) ? q.answer : [q.answer];
        const nums = arr.map(v => (typeof v === 'number' ? v : parseFloat(v))).filter(v => Number.isFinite(v));
        q.answer = nums.length <= 1 ? (nums[0] != null ? nums[0] : 0) : nums;
      } else {
        const answers = Array.isArray(q.answer) ? q.answer : [q.answer];
        const cleaned = answers.map(a => normalizeSpaces(a)).filter(Boolean);
        q.answer = cleaned.length <= 1 ? (cleaned[0] || '') : cleaned;
      }

      q.text = normalizeSpaces(q.text || `Question ${index + 1}`);
      q.description = normalizeSpaces(q.description || '');
      return q;
    });

    const optimized = optimizeQuizQuestions(normalized, {
      topic: context.topic,
      facets: context.facets,
      keyIdeas: context.keyIdeas,
      difficulty: context.difficulty,
      answerHint: context.answerHint,
      defaultType: context.requestedType || 'multiple'
    });

    const titleBase = normalizeSpaces(input.title || `${context.topic} Quiz (Draft)`);
    const descriptionBase = normalizeSpaces(input.description || context.description);

    return {
      title: titleBase,
      description: descriptionBase,
      showQuestionResults: true,
      showCorrectAnswersForIncorrect: false,
      questions: optimized
    };
  }

  async function callOpenAiForQuiz({ model, apiKey, systemPrompt, userPrompt, context }) {
    if (!apiKey) throw new Error('OpenAI API key is required. Add it in Profile settings.');

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model || 'gpt-4.1-mini',
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ]
      })
    });

    const data = await response.json();
    if (!response.ok) {
      const message = data && data.error && data.error.message
        ? data.error.message
        : 'OpenAI request failed';
      throw new Error(message);
    }

    const content = data
      && data.choices
      && data.choices[0]
      && data.choices[0].message
      && typeof data.choices[0].message.content === 'string'
      ? data.choices[0].message.content
      : '';

    if (!content.trim()) throw new Error('OpenAI returned an empty response');
    const parsed = tryParseQuizJson(content);
    return normalizeQuizFromAiDraft(parsed, context);
  }

  function buildOpenAiPromptFromConfig(config, prompt) {
    const typeLabel = config.requestedType || 'mixed';
    const domainGuidance = 'Domain guidance: Stay within the user topic and focus. If uncertain about niche facts, prefer conceptual/practical questions rather than specific trivia.';

    return `Create a quiz as strict JSON only.\nTopic: ${config.topic}\nQuestion count: ${config.questionCount}\nRequested type: ${typeLabel}\nDifficulty: ${config.difficulty}\nFocus: ${config.focus || 'none'}\nInclude math/equations: ${config.includeMath ? 'yes' : 'no'}\nPrompt summary: ${prompt}\n${domainGuidance}\nCorrectness rules: (1) Every question must have factually consistent answer key. (2) For multiple, correct must point to exactly one true option. (3) For multi, correct must include all and only true options. (4) Do not output placeholder answers like "topic basics". (5) Ensure options are semantically distinct and not contradictory.`;
  }

  function buildOpenAiPromptFromStudyText(fileName, studyText) {
    const clipped = (studyText || '').slice(0, 14000);
    return `Create a quiz as strict JSON only from this study guide text.\nFile name: ${fileName}\nUse 6 to 12 questions depending on content coverage.\nMix question types naturally: multiple, multi, matching, text, and number when appropriate.\nCorrectness rules: keep answer keys strictly consistent with the source text; if source lacks a specific fact, ask a conceptual question supported by the source instead of guessing.\nStudy text:\n${clipped}`;
  }

  function openAiSystemPrompt() {
    return 'You generate educational quizzes and must output ONLY valid JSON with shape: {"title":string,"description":string,"questions":[{"type":"multiple|multi|matching|text|number","text":string,"description":string,"options"?:string[],"correct"?:number|number[],"answer"?:string|string[]|number|number[],"pairs"?:[{"left":string,"right":string}]}]}. For multiple/multi include at least 4 options. For matching include at least 3 pairs. No markdown fences. Prioritize factual correctness over creativity. Never fabricate specific lore/trivia when uncertain; instead produce conceptual or mechanics-focused questions that remain correct. Verify each correct index maps to the intended option text before returning JSON.';
  }

  function initAiQuizGenerator(applyQuizToEditor, options = {}) {
    const buttonEl = byId('ai-generate-btn');
    const pdfInputEl = byId('ai-pdf-file');
    const pdfButtonEl = byId('ai-generate-pdf-btn');
    const statusEl = byId('ai-generate-status');
    if (!buttonEl || !statusEl || typeof applyQuizToEditor !== 'function') return;

    buttonEl.addEventListener('click', async () => {
      const settings = readRuntimeAiSettings(options);
      const config = await askDraftQuizConfig(settings);
      if (!config) {
        statusEl.textContent = 'Draft generation canceled.';
        return;
      }

      const prompt = normalizeSpaces(
        config.generalPrompt || [config.topic, config.focus].filter(Boolean).join(' — ') || config.topic
      );
      const useOpenAi = !!config.useOpenAi;
      const reviewEnabled = shouldReviewGeneratedQuestions(settings);

      buttonEl.disabled = true;
      const originalText = buttonEl.textContent;
      buttonEl.textContent = 'Generating...';
      statusEl.textContent = useOpenAi ? 'Generating quiz with OpenAI...' : 'Generating quiz locally...';

      try {
        let quiz;
        if (useOpenAi) {
          if (!normalizeSpaces(settings.openaiApiKey || '')) {
            throw new Error('OpenAI is selected, but no API key is saved. Add it in Profile settings.');
          }

          const context = {
            topic: config.topic,
            facets: extractPromptFacets(prompt),
            keyIdeas: splitPromptSegments(prompt),
            difficulty: config.difficulty,
            answerHint: config.constraints && config.constraints.answerHint ? config.constraints.answerHint : '',
            requestedType: config.requestedType,
            description: `Draft generated from OpenAI prompt for ${config.topic}. Review and edit wording/answers before publishing.`
          };

          quiz = await callOpenAiForQuiz({
            model: settings.openaiModel,
            apiKey: settings.openaiApiKey,
            systemPrompt: openAiSystemPrompt(),
            userPrompt: buildOpenAiPromptFromConfig(config, prompt),
            context
          });
        } else {
          quiz = buildLocalQuizFromPrompt(prompt, config);
        }

        const finalQuiz = reviewEnabled ? reviewQuizWithPrompts(quiz) : quiz;
        applyQuizToEditor(finalQuiz);
        statusEl.textContent = useOpenAi
          ? `Generated ${quiz.questions.length} question(s) with OpenAI. Review and save when ready.`
          : `Generated ${quiz.questions.length} question(s) locally. Review and save when ready.`;
      } catch (err) {
        const msg = err && err.message ? err.message : 'Failed to generate quiz';
        statusEl.textContent = msg;
        alert(msg);
      } finally {
        buttonEl.disabled = false;
        buttonEl.textContent = originalText;
      }
    });

    if (pdfInputEl && pdfButtonEl) {
      pdfButtonEl.addEventListener('click', async () => {
        const file = pdfInputEl.files && pdfInputEl.files[0] ? pdfInputEl.files[0] : null;
        if (!file) {
          alert('Choose a PDF file first.');
          return;
        }
        if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') {
          alert('Please upload a PDF file.');
          return;
        }

        const settings = readRuntimeAiSettings(options);
        const useOpenAi = (settings.aiProvider || 'local') === 'openai';
        const reviewEnabled = shouldReviewGeneratedQuestions(settings);

        pdfButtonEl.disabled = true;
        const originalPdfBtnText = pdfButtonEl.textContent;
        pdfButtonEl.textContent = 'Reading PDF...';
        statusEl.textContent = useOpenAi ? 'Extracting text from PDF for OpenAI...' : 'Extracting text from PDF...';

        try {
          const studyText = await extractTextFromPdfFile(file);
          if (!studyText || studyText.trim().length < 120) {
            throw new Error('Could not read enough text from this PDF.');
          }

          let quiz;
          if (useOpenAi) {
            if (!normalizeSpaces(settings.openaiApiKey || '')) {
              throw new Error('OpenAI is selected, but no API key is saved. Add it in Profile settings.');
            }

            const context = {
              topic: capitalizeWords((file.name || '').replace(/\.pdf$/i, '')) || 'Study Guide',
              facets: keywordCandidates(studyText).map(capitalizeWords),
              keyIdeas: createTextSummaryParts(studyText),
              difficulty: normalizeDifficulty(settings.defaultDifficulty || 'medium'),
              answerHint: '',
              requestedType: null,
              description: `Draft generated from OpenAI using ${file.name}. Review and edit wording/answers before publishing.`
            };

            quiz = await callOpenAiForQuiz({
              model: settings.openaiModel,
              apiKey: settings.openaiApiKey,
              systemPrompt: openAiSystemPrompt(),
              userPrompt: buildOpenAiPromptFromStudyText(file.name, studyText),
              context
            });
          } else {
            quiz = buildLocalQuizFromStudyText(studyText, file.name);
          }

          const finalQuiz = reviewEnabled ? reviewQuizWithPrompts(quiz) : quiz;
          applyQuizToEditor(finalQuiz);
          statusEl.textContent = useOpenAi
            ? `Generated ${quiz.questions.length} question(s) from ${file.name} with OpenAI. Review and save when ready.`
            : `Generated ${quiz.questions.length} question(s) from ${file.name}. Review and save when ready.`;
        } catch (err) {
          const msg = (err && err.message) ? err.message : 'Failed to generate quiz from PDF';
          statusEl.textContent = msg;
          alert(msg);
        } finally {
          pdfButtonEl.disabled = false;
          pdfButtonEl.textContent = originalPdfBtnText;
        }
      });
    }
  }

  window.AIQuiz = {
    initAiQuizGenerator,
    buildLocalQuizFromPrompt,
    buildLocalQuizFromStudyText,
    extractTextFromPdfFile
  };
})();
