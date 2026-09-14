const fs = require('fs');
const vm = require('vm');

const source = fs.readFileSync('index.html', 'utf8');

function extractFunction(name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`Cannot find production function ${name}`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let i = bodyStart; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '{') depth += 1;
    if (ch === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`Unclosed production function ${name}`);
}

const functions = [
  'getProgramTrackId',
  'getStatus'
].map(name => name === 'getProgramTrackId'
  ? fs.readFileSync('js/core/registry.js', 'utf8').match(/function getProgramTrackId\([\s\S]*?\n  \}/)[0]
  : extractFunction(name));

const state = {
  progress: {},
  normalizedCourses: { TRACK_A: [] },
  programTrackIds: { PROGRAM_A: 'TRACK_A', PROGRAM_B: 'TRACK_A' }
};

const context = vm.createContext({
  ...state,
  Set,
  Number
});
context.window = context;
vm.runInContext(fs.readFileSync('js/core/prerequisites.js', 'utf8'), context, { filename: 'js/core/prerequisites.js' });
vm.runInContext(functions.join('\n'), context, { filename: 'production-contract-functions.js' });

function assertEqual(name, expected, actual) {
  if (expected !== actual) {
    throw new Error(`${name}: expected ${expected}, actual ${actual}`);
  }
  console.log(`PASS ${name}: ${actual}`);
}

function course(slotId, overrides = {}) {
  return {
    slotId,
    code: overrides.code || slotId,
    credits: 3,
    category: 'core',
    ...overrides
  };
}

function setStatuses(programId, statuses) {
  context.progress[programId] = statuses;
}

function qualifying(programId = 'PROGRAM_A') {
  const trackId = context.programTrackIds[programId];
  return context.NUITCSPrerequisites.getCompletedQualifyingCredits({
    courses: context.normalizedCourses[trackId] || [],
    progressByProgram: context.progress,
    programId
  });
}

const cases = [];
function caseOf(name, expected, fn) {
  const actual = fn();
  assertEqual(name, expected, actual);
  cases.push(name);
}

context.normalizedCourses.TRACK_A = [course('normal')];
setStatuses('PROGRAM_A', {});
caseOf('zero credits', 0, qualifying);
setStatuses('PROGRAM_A', { normal: 'completed' });
caseOf('completed normal course', 3, qualifying);
setStatuses('PROGRAM_A', { normal: 'in_progress' });
caseOf('in progress excluded', 0, qualifying);
setStatuses('PROGRAM_A', { normal: 'not_started' });
caseOf('not started excluded', 0, qualifying);

context.normalizedCourses.TRACK_A = [
  course('training', { category: 'training' }),
  course('reference', { referenceOnly: true }),
  course('nongpa', { countsGpa: false }),
  course('project', { category: 'project', credits: 5 }),
  course('zero', { credits: 0 }),
  course('missing', { credits: undefined }),
  course('nonnumeric', { credits: 'not-a-number' }),
  course('summer', { termType: 'summer', credits: 2 }),
  course('placeholder', { code: 'CSCI/AIS 4xx', credits: 3 })
];
setStatuses('PROGRAM_A', {
  training: 'completed', reference: 'completed', nongpa: 'completed',
  project: 'completed', zero: 'completed', missing: 'completed',
  nonnumeric: 'completed', summer: 'completed', placeholder: 'completed'
});
caseOf('training excluded', 0 + 5 + 0 + 0 + 2 + 3, qualifying);
caseOf('reference-only excluded', 5 + 0 + 0 + 2 + 3, qualifying);
caseOf('countsGpa false excluded', 5 + 0 + 0 + 2 + 3, qualifying);
caseOf('project included', 5 + 0 + 0 + 2 + 3, qualifying);
caseOf('virtual-code behavior unchanged', 5 + 0 + 0 + 2 + 3, qualifying);
caseOf('zero-credit included as zero', 5 + 0 + 0 + 2 + 3, qualifying);
caseOf('missing credits coerce to zero', 5 + 0 + 0 + 2 + 3, qualifying);
caseOf('non-numeric credits coerce to zero', 5 + 0 + 0 + 2 + 3, qualifying);
caseOf('summer included', 5 + 0 + 0 + 2 + 3, qualifying);
caseOf('placeholder included', 5 + 0 + 0 + 2 + 3, qualifying);

context.normalizedCourses.TRACK_A = [
  course('dup-a', { code: 'DUP 101', credits: 4 }),
  course('dup-b', { code: 'DUP 101', credits: 7 })
];
setStatuses('PROGRAM_A', { 'dup-a': 'completed', 'dup-b': 'not_started' });
caseOf('duplicate code only completed slot contributes', 4, qualifying);
setStatuses('PROGRAM_A', { 'dup-a': 'not_started', 'dup-b': 'completed' });
caseOf('slot identity is independent', 7, qualifying);
setStatuses('PROGRAM_B', { 'dup-a': 'completed', 'dup-b': 'not_started' });
caseOf('program isolation', 4, () => qualifying('PROGRAM_B'));

context.normalizedCourses.TRACK_A = [];
context.progress.PROGRAM_A = {};
caseOf('86 credits is unmet', false, () => context.NUITCSPrerequisites.evaluatePrerequisite(
  { type: 'min_credit_hours', value: 87 }, { completedCredits: 86 }).satisfied);
caseOf('87 credits is satisfied', true, () => context.NUITCSPrerequisites.evaluatePrerequisite(
  { type: 'min_credit_hours', value: 87 }, { completedCredits: 87 }).satisfied);
caseOf('88 credits is satisfied', true, () => context.NUITCSPrerequisites.evaluatePrerequisite(
  { type: 'min_credit_hours', value: 87 }, { completedCredits: 88 }).satisfied);

const statisticsSource = fs.readFileSync('js/core/statistics.js', 'utf8');
const statisticsContext = vm.createContext({ window: {}, Set, Number });
vm.runInContext(statisticsSource, statisticsContext, { filename: 'js/core/statistics.js' });
const stats = statisticsContext.window.NUITCSStatistics;
const statsCourses = [
  course('degree', { credits: 3 }),
  course('training', { credits: 6, category: 'training' })
];
const statsProgress = { PROGRAM_A: { degree: 'completed', training: 'completed' } };
const progress = stats.computeProgress({
  courses: statsCourses,
  progressByProgram: statsProgress,
  programId: 'PROGRAM_A',
  graduation: { total: 9, gpaCredits: 3 }
});
assertEqual('statistics includes training in degree total', 9, progress.totalDone);
assertEqual('statistics excludes training from GPA total', 3, progress.gpaDone);
assertEqual('qualifying credits excludes training', 3, (() => {
  context.normalizedCourses.TRACK_A = statsCourses;
  context.progress.PROGRAM_A = { degree: 'completed', training: 'completed' };
  return qualifying();
})());

console.log(`PASS qualifying-credit contract cases: ${cases.length + 4}`);
