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
)(
  {
    general: [{ slotId: 'CS-S1-01', code: 'CSCI 101' }],
    ai: [{ slotId: 'AI-S1-01', code: 'AIS 201' }, { slotId: 'AI-S7-01', code: 'AIS 401' }],
    biomedical: [{ slotId: 'BMD-S1-01', code: 'BMD 101' }],
    cybersecurity: [{ slotId: 'CSEC-S1-01', code: 'CSEC 101' }]
  },
  { cs: 'general', ai: 'ai', bmd: 'biomedical', csec: 'cybersecurity' }
);

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const statuses = ['not_started', 'in_progress', 'completed'];

for (const root of [null, [], 'text', 42, true]) {
  assert(Object.keys(sanitizeProgress(root)).length === 0, `invalid root accepted: ${String(root)}`);
}

const sanitized = sanitizeProgress({
  cs: {
    'CS-S1-01': 'completed',
    'CSCI 101': 'in_progress',
    'FAKE-SLOT': 'completed',
    'CS-S1-01-invalid': 'completed',
    badStatus: 'paused',
    nullStatus: null
  },
  ai: { 'AI-S7-01': 'completed' },
  unknown: { 'CS-S1-01': 'completed' },
  biomedical: [],
  csec: 'malformed'
});

assert(sanitized.cs['CS-S1-01'] === 'completed', 'valid slot was not preserved');
assert(sanitized.cs['CSCI 101'] === 'in_progress', 'legacy course-code entry was not preserved');
assert(sanitized.ai['AI-S7-01'] === 'completed', 'second valid program was not preserved');
assert(!sanitized.cs['FAKE-SLOT'], 'unknown slot was accepted');
assert(!sanitized.cs.badStatus && !sanitized.cs.nullStatus, 'invalid status was accepted');
assert(!sanitized.unknown && !sanitized.biomedical && !sanitized.csec, 'invalid program shape was accepted');
assert(statuses.includes(sanitized.cs['CS-S1-01']), 'valid status vocabulary changed');

console.log('PASS: progress validation contract');
