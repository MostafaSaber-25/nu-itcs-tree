const fs = require('fs');
const source = fs.readFileSync('index.html', 'utf8');

function extractFunction(name) {
  const start = source.indexOf(`function ${name}`);
  if (start < 0) throw new Error(`${name} not found`);
  const braceStart = source.indexOf('{', start);
  let depth = 0;
  for (let i = braceStart; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`${name} has unbalanced braces`);
}

const sanitizeProgress = Function(
  'normalizedCourses',
  'programTrackIds',
  `${extractFunction('sanitizeProgress')}; return sanitizeProgress;`
)({
  general: [{ slotId: 'CS-S1-01', code: 'CSCI 101' }],
  ai: [
    { slotId: 'AI-S1-01', code: 'AIS 201' },
    { slotId: 'AI-S7-AIS-401-01', code: 'AIS 401' },
    { slotId: 'AI-S7-AIS-401-02', code: 'AIS 401' }
  ],
  biomedical: [{ slotId: 'BMD-S1-01', code: 'BMD 101' }],
  cybersecurity: [{ slotId: 'CSEC-S1-01', code: 'CSEC 101' }]
}, { cs: 'general', ai: 'ai', bmd: 'biomedical', csec: 'cybersecurity' });

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const importReplacement = (current, raw) => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { accepted: false, progress: current };
  return { accepted: true, progress: sanitizeProgress(raw) };
};

for (const value of [null, [], 'text', 42, false, '{bad json}']) {
  const current = { cs: { 'CS-S1-01': 'completed' } };
  let parsed = value;
  if (value === '{bad json}') {
    try { parsed = JSON.parse(value); } catch { parsed = null; }
  }
  const result = importReplacement(current, parsed);
  assert(!result.accepted, `invalid root was accepted: ${String(value)}`);
  assert(result.progress === current, 'invalid root replaced current progress');
}

const valid = importReplacement({}, {
  cs: { 'CS-S1-01': 'completed' },
  ai: { 'AI-S1-01': 'in_progress' }
});
assert(valid.accepted, 'valid import was rejected');
assert(valid.progress.cs['CS-S1-01'] === 'completed', 'valid CS slot was not imported');
assert(valid.progress.ai['AI-S1-01'] === 'in_progress', 'valid AI slot was not imported');

const mixed = importReplacement({ cs: { 'CS-S1-01': 'completed' } }, {
  cs: {
    'CS-S1-01': 'in_progress',
    'FAKE-SLOT': 'completed',
    'CS-S1-01-invalid': 'completed',
    invalid: 'paused'
  },
  unknown: { 'CS-S1-01': 'completed' },
  ai: { 'AI-S1-01': 'completed' },
  biomedical: 'malformed'
});
assert(mixed.progress.cs['CS-S1-01'] === 'in_progress', 'valid mixed entry was lost');
assert(mixed.progress.ai['AI-S1-01'] === 'completed', 'valid neighboring program was lost');
assert(!mixed.progress.cs['FAKE-SLOT'], 'fake slot survived import');
assert(!mixed.progress.unknown && !mixed.progress.biomedical, 'invalid program survived import');

const legacy = importReplacement({}, { cs: { 'CSCI 101': 'completed' } });
assert(legacy.progress.cs['CSCI 101'] === 'completed', 'legacy course-code import was discarded');

const ambiguous = importReplacement({}, { ai: { 'AIS 401': 'completed' } });
assert(ambiguous.progress.ai['AIS 401'] === 'completed', 'ambiguous legacy import was discarded before migration');
assert(!ambiguous.progress.ai['AI-S7-AIS-401-01'], 'ambiguous legacy import was assigned to slot 1');
assert(!ambiguous.progress.ai['AI-S7-AIS-401-02'], 'ambiguous legacy import was assigned to slot 2');

console.log('PASS: import progress contract');
