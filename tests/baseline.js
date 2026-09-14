const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const start = html.indexOf('const allTracksData =');
const end = html.indexOf('  const { validateAuthoredSlotIds', start);
if (start < 0 || end < 0) throw new Error('Could not locate allTracksData');
const source = html.slice(html.indexOf('{', start), html.lastIndexOf('};', end) + 1);
const data = vm.runInNewContext(`(${source})`);

const expectedCounts = { general: 47, ai: 47, biomedical: 49, cybersecurity: 47 };
const expectedPeriods = [1, 2, 3, 4, 'Y2', 5, 6, 'Y3', 7, 8];
const expectedCredits = [14, 16, 18, 18, 3, 18, 18, 3, 15, 15];
const failures = [];
const all = [];

for (const [program, courses] of Object.entries(data)) {
  if (courses.length !== expectedCounts[program]) failures.push(`${program}: expected ${expectedCounts[program]} slots, got ${courses.length}`);
  const ids = new Set();
  for (const course of courses) {
    if (!course.slotId) failures.push(`${program}/${course.code}: missing slotId`);
    if (ids.has(course.slotId)) failures.push(`${program}: duplicate slotId ${course.slotId}`);
    ids.add(course.slotId);
    all.push({
      program, slotId: course.slotId, code: course.code, title: course.titleEn,
      credits: course.credits, semester: course.semester ?? null,
      termType: course.type === 'summer' ? 'summer' : 'regular', year: course.year ?? null,
      category: course.category, prereqs: course.prereqs || []
    });
  }
}

if (all.length !== 190) failures.push(`expected 190 total slots, got ${all.length}`);
const globalIds = all.map(c => c.slotId);
if (new Set(globalIds).size !== globalIds.length) failures.push('duplicate slot IDs across programs');
if (all.some(c => !c.slotId)) failures.push('generated/missing authored slot ID detected');

for (const program of Object.keys(expectedCounts)) {
  const courses = all.filter(c => c.program === program);
  const periods = expectedPeriods.map(period => {
    const selected = courses.filter(c => period === 'Y2' ? c.termType === 'summer' && c.year === 2 : period === 'Y3' ? c.termType === 'summer' && c.year === 3 : c.termType === 'regular' && c.semester === period);
    return { period, slotIds: selected.map(c => c.slotId), credits: selected.reduce((sum, c) => sum + Number(c.credits || 0), 0) };
  });
  periods.forEach((period, index) => {
    if (period.credits !== expectedCredits[index]) failures.push(`${program}/${period.period}: expected ${expectedCredits[index]} credits, got ${period.credits}`);
  });
}

const snapshot = { generatedAt: 'deterministic', slots: all.sort((a, b) => a.slotId.localeCompare(b.slotId)), expectedPeriods, expectedCredits };
const outDir = path.join(__dirname, 'baseline', 'snapshots');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'curriculum.snapshot.json'), JSON.stringify(snapshot, null, 2) + '\n');

const studyPlan = Object.fromEntries(Object.keys(expectedCounts).map(program => [program,
  expectedPeriods.map(period => {
    const selected = all.filter(c => c.program === program && (period === 'Y2'
      ? c.termType === 'summer' && c.year === 2
      : period === 'Y3'
        ? c.termType === 'summer' && c.year === 3
        : c.termType === 'regular' && c.semester === period));
    return { period, slotIds: selected.map(c => c.slotId), codes: selected.map(c => c.code), credits: selected.reduce((sum, c) => sum + Number(c.credits || 0), 0) };
  })
]));
fs.writeFileSync(path.join(outDir, 'study-plan.snapshot.json'), JSON.stringify({ generatedAt: 'deterministic', periods: studyPlan }, null, 2) + '\n');
fs.writeFileSync(path.join(outDir, 'totals.snapshot.json'), JSON.stringify({ generatedAt: 'deterministic', programs: Object.fromEntries(Object.keys(expectedCounts).map(program => [program, { total: 138, gpa: 132, training: 6, project: 6 }])) }, null, 2) + '\n');
fs.writeFileSync(path.join(outDir, 'progress-contract.snapshot.json'), JSON.stringify({ generatedAt: 'deterministic', storageKey: 'nu_itcs_progress_v1', identity: ['program', 'slotId'], statuses: ['not_started', 'in_progress', 'completed'], transitions: ['not_started -> in_progress -> completed -> not_started'] }, null, 2) + '\n');
fs.writeFileSync(path.join(outDir, 'recommendation-contract.snapshot.json'), JSON.stringify({ generatedAt: 'deterministic', rules: ['earliest unfinished official period', 'ready/locked prerequisite state', 'exclude completed', 'no future-period leakage', 'preserve Summer', 'preserve training/project rules', 'preserve placeholder identity'] }, null, 2) + '\n');
fs.writeFileSync(path.join(outDir, 'ui-contract.snapshot.json'), JSON.stringify({ generatedAt: 'deterministic', invariants: ['curriculum map', 'status controls', 'filters', 'catalog search/filter/status', 'duplicate AIS401 visibility', 'program switching', 'recommendation rendering'] }, null, 2) + '\n');

console.log(`Curriculum slots: ${all.length}`);
console.log(`Explicit slot IDs: ${all.filter(c => c.slotId).length}`);
console.log(`Generated slot IDs: ${all.filter(c => !c.slotId).length}`);
console.log(`Duplicate slot IDs: ${new Set(globalIds).size === globalIds.length ? 0 : 'detected'}`);
if (failures.length) { console.error(failures.map(item => `FAIL: ${item}`).join('\n')); process.exit(1); }
console.log('PASS: baseline curriculum invariants');
