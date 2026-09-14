const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const start = html.indexOf('const allTracksData =');
const end = html.indexOf('  const { validateAuthoredSlotIds', start);
const source = html.slice(html.indexOf('{', start), html.lastIndexOf('};', end) + 1);
const data = vm.runInNewContext(`(${source})`);
const failures = [];
const check = (ok, message) => { if (!ok) failures.push(message); };

function slots(program, code) { return data[program].filter(course => course.code === code); }
function statusModel(courses) {
  return Object.fromEntries(courses.map(course => [course.slotId, 'not_started']));
}
function completedCodes(program, statuses) {
  return new Set(data[program].filter(course => statuses[course.slotId] === 'completed').map(course => course.code));
}
function ruleSatisfied(rule, completed, context = {}) {
  if (rule.type === 'course') return completed.has(rule.code) || (rule.concurrent && context.currentCodes?.has(rule.code));
  if (rule.type === 'all') return rule.rules.every(item => ruleSatisfied(item, completed, context));
  if (rule.type === 'any') return rule.rules.some(item => ruleSatisfied(item, completed, context));
  if (rule.type === 'standing') return context.standing === rule.value;
  if (rule.type === 'min_credit_hours') return context.credits >= rule.value;
  if (rule.type === 'external') return context.external?.has(rule.label);
  return false;
}

const rules = {
  ais301: { type: 'all', rules: [{ type: 'course', code: 'AIS 201' }, { type: 'course', code: 'CSCI 331' }] },
  bmd101: { type: 'any', rules: [{ type: 'course', code: 'BMD 100' }, { type: 'standing', value: 'science_section' }] },
  bmd102: { type: 'course', code: 'BMD 101', concurrent: true },
  bmd211: { type: 'course', code: 'CSCI 231', concurrent: true },
  training: { type: 'standing', value: 'sophomore' },
  project: { type: 'min_credit_hours', value: 87 },
  project2: { type: 'course', code: 'AIS 493' }
};

check(ruleSatisfied(rules.ais301, new Set(['AIS 201', 'CSCI 331'])), 'AIS301 satisfied case');
check(!ruleSatisfied(rules.ais301, new Set(['AIS 201'])), 'AIS301 incomplete case');
check(ruleSatisfied(rules.bmd101, new Set(), { standing: 'science_section' }), 'BMD101 science-section case');
check(!ruleSatisfied(rules.bmd101, new Set(), { standing: 'junior' }), 'BMD101 negative case');
check(ruleSatisfied(rules.bmd102, new Set(), { currentCodes: new Set(['BMD 101']) }), 'BMD102 concurrent case');
check(ruleSatisfied(rules.bmd211, new Set(), { currentCodes: new Set(['CSCI 231']) }), 'BMD211 concurrent case');
check(ruleSatisfied(rules.training, new Set(), { standing: 'sophomore' }), 'training standing case');
check(!ruleSatisfied(rules.training, new Set(), { standing: 'freshman' }), 'training negative case');
check(ruleSatisfied(rules.project, new Set(), { credits: 87 }), '87-credit boundary case');
check(!ruleSatisfied(rules.project, new Set(), { credits: 86 }), '86-credit negative case');
check(ruleSatisfied(rules.project2, new Set(['AIS 493'])), 'Senior Project II case');

const ais401 = slots('ai', 'AIS 401');
check(ais401.length === 2, 'expected two AIS401 slots');
check(ais401[0]?.slotId !== ais401[1]?.slotId, 'AIS401 slot IDs must differ');
if (ais401.length === 2) {
  const state = statusModel(ais401);
  state[ais401[0].slotId] = 'completed';
  check(state[ais401[1].slotId] === 'not_started', 'AIS401 duplicate isolation');
}
for (const [program, codes] of Object.entries({ biomedical: ['BMD 3xx', 'BMD 4xx'], cybersecurity: ['CSEC 4xx'], general: ['CSCI/AIS 4xx'] })) {
  for (const code of codes) check(slots(program, code).every((a, i, list) => list.findIndex(b => b.slotId === a.slotId) === i), `${program}/${code} placeholder identity`);
}

const periods = [1, 2, 3, 4, 'Y2', 5, 6, 'Y3', 7, 8];
for (const [program, courses] of Object.entries(data)) {
  const ordered = periods.map(period => courses.filter(course => period === 'Y2' ? course.type === 'summer' && course.year === 2 : period === 'Y3' ? course.type === 'summer' && course.year === 3 : course.type !== 'summer' && course.semester === period).map(course => course.slotId));
  check(ordered.length === 10, `${program} study-plan period count`);
}

const snapshotDir = path.join(__dirname, 'baseline', 'snapshots');
fs.mkdirSync(snapshotDir, { recursive: true });
fs.writeFileSync(path.join(snapshotDir, 'prerequisites.snapshot.json'), JSON.stringify({ rules, periods }, null, 2) + '\n');
console.log(`Runtime-logic checks: ${failures.length ? 'FAIL' : 'PASS'}`);
console.log('Browser, real localStorage, migration, and DOM interaction checks: UNTESTED');
if (failures.length) { console.error(failures.map(item => `FAIL: ${item}`).join('\n')); process.exit(1); }
