const fs = require('fs');
const vm = require('vm');

const source = fs.readFileSync('index.html', 'utf8');

function extractFunction(name) {
  const start = source.indexOf(`function ${name}(`);
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

const context = vm.createContext({
  progress: {
    ai: {
      'AI-PREREQ-01': 'completed',
      'AI-S7-AIS-401-01': 'completed',
      'AI-S7-AIS-401-02': 'not_started'
    },
    bmd: { 'BMD-PREREQ-01': 'in_progress' }
  },
  normalizedCourses: {
    ai: [
      { code: 'UNIQUE 101', slotId: 'AI-PREREQ-01' },
      { code: 'AIS 401', slotId: 'AI-S7-AIS-401-01' },
      { code: 'AIS 401', slotId: 'AI-S7-AIS-401-02' }
    ],
    biomedical: [{ code: 'UNIQUE 101', slotId: 'BMD-PREREQ-01' }]
  },
  programTrackIds: { ai: 'ai', bmd: 'biomedical' },
  NUITCSPrerequisites: {},
  Set
});

context.window = context;
const registrySource = fs.readFileSync('js/core/registry.js', 'utf8');
const registryFunction = registrySource.match(/function getProgramTrackId\([\s\S]*?\n  \}/)[0];
vm.runInContext(registryFunction, context, { filename: 'js/core/registry.js' });
vm.runInContext(fs.readFileSync('js/core/prerequisites.js', 'utf8'), context, { filename: 'js/core/prerequisites.js' });
vm.runInContext(extractFunction('getStatus'), context, { filename: 'index.html:getStatus' });
vm.runInContext('', context, {
  filename: 'production-evaluator-contract.js'
});

function result(satisfied, reason, unmetRequirements) {
  return { satisfied, reason, unmetRequirements };
}

function check(name, expected, actual) {
  const e = JSON.stringify(expected);
  const a = JSON.stringify(actual);
  if (e !== a) throw new Error(`${name}: expected ${e}, actual ${a}`);
  console.log(`PASS ${name}: expected=${e} actual=${a}`);
}

function evaluate(rule, overrides = {}) {
  const base = {
    programId: 'ai',
    standing: null,
    sections: new Set(),
    satisfiedReferenceCodes: new Set(),
    completedCredits: 0,
    ...overrides
  };
  base.courses = overrides.courses || context.normalizedCourses[base.programId] || context.normalizedCourses.ai;
  base.resolvePrerequisiteSlots = context.NUITCSPrerequisites.resolvePrerequisiteSlots;
  base.getStatus = context.getStatus;
  return context.NUITCSPrerequisites.evaluatePrerequisite(rule, base);
}

const ordinary = { type: 'course', code: 'UNIQUE 101' };
const concurrent = { type: 'course', code: 'UNIQUE 101', allowConcurrent: true };
const duplicate = { type: 'course', code: 'AIS 401' };

check('no rule null', result(true, '', []), evaluate(null));
check('no rule undefined', result(true, '', []), evaluate(undefined));
check('course satisfied', result(true, '', []), evaluate(ordinary));

context.progress.ai['AI-PREREQ-01'] = 'not_started';
check('course unsatisfied', result(false, 'Requires UNIQUE 101', ['UNIQUE 101']), evaluate(ordinary));
context.progress.ai['AI-PREREQ-01'] = 'in_progress';
check('ordinary in-progress unsatisfied', result(false, 'Requires UNIQUE 101', ['UNIQUE 101']), evaluate(ordinary));
check('concurrent in-progress satisfied', result(true, '', []), evaluate(concurrent));
context.progress.ai['AI-PREREQ-01'] = 'completed';
check('concurrent completed satisfied', result(true, '', []), evaluate(concurrent));
context.progress.ai['AI-PREREQ-01'] = 'not_started';
check('concurrent not-started unsatisfied', result(false, 'Requires UNIQUE 101 completed or in progress', ['UNIQUE 101']), evaluate(concurrent));

check('missing course', result(false, 'Requires MISSING 999', ['MISSING 999']), evaluate({ type: 'course', code: 'MISSING 999' }));
check('satisfied reference fallback', result(true, '', []), evaluate({ type: 'course', code: 'MISSING 999' }, { satisfiedReferenceCodes: new Set(['MISSING 999']) }));

context.progress.ai['AI-S7-AIS-401-01'] = 'not_started';
check('explicit slot unsatisfied', result(false, 'Requires AIS 401', ['AIS 401']), evaluate({ type: 'course', code: 'AIS 401', slotId: 'AI-S7-AIS-401-01' }));
context.progress.ai['AI-S7-AIS-401-01'] = 'completed';
check('explicit slot satisfied', result(true, '', []), evaluate({ type: 'course', code: 'AIS 401', slotId: 'AI-S7-AIS-401-01' }));

context.progress.ai['AI-S7-AIS-401-01'] = 'completed';
context.progress.ai['AI-S7-AIS-401-02'] = 'not_started';
check('duplicate AIS401 ambiguous', result(false, 'Ambiguous prerequisite AIS 401', ['AIS 401']), evaluate(duplicate));
check('AIS401 explicit slot 1', result(true, '', []), evaluate({ ...duplicate, slotId: 'AI-S7-AIS-401-01' }));
context.progress.ai['AI-S7-AIS-401-01'] = 'not_started';
context.progress.ai['AI-S7-AIS-401-02'] = 'completed';
check('AIS401 explicit slot 2', result(true, '', []), evaluate({ ...duplicate, slotId: 'AI-S7-AIS-401-02' }));

context.progress.ai['AI-S7-AIS-401-01'] = 'completed';
context.progress.ai['AI-S7-AIS-401-02'] = 'not_started';
check('match any first slot completed', result(true, '', []), evaluate({ ...duplicate, match: 'any' }));
context.progress.ai['AI-S7-AIS-401-01'] = 'not_started';
context.progress.ai['AI-S7-AIS-401-02'] = 'completed';
check('match any first slot incomplete', result(false, 'Requires AIS 401', ['AIS 401']), evaluate({ ...duplicate, match: 'any' }));

context.progress.ai['AI-PREREQ-01'] = 'completed';
const both = { type: 'all', requirements: [ordinary, { type: 'course', code: 'MISSING A' }] };
check('all partial failure', result(false, 'Requires MISSING A', ['MISSING A']), evaluate(both));
check('all multiple failures and ordering', result(false, 'Requires MISSING A; Requires MISSING B', ['MISSING A', 'MISSING B']), evaluate({ type: 'all', requirements: [{ type: 'course', code: 'MISSING A' }, { type: 'course', code: 'MISSING B' }] }));
check('all satisfied', result(true, '', []), evaluate({ type: 'all', requirements: [ordinary, ordinary] }));
check('any first satisfied wins', result(true, '', []), evaluate({ type: 'any', requirements: [ordinary, { type: 'course', code: 'MISSING A' }] }));
check('any later satisfied wins', result(true, '', []), evaluate({ type: 'any', requirements: [{ type: 'course', code: 'MISSING A' }, ordinary] }));
check('any all failed', result(false, 'Requires MISSING A OR Requires MISSING B', ['MISSING A', 'MISSING B']), evaluate({ type: 'any', requirements: [{ type: 'course', code: 'MISSING A' }, { type: 'course', code: 'MISSING B' }] }));
check('nested all-any', result(false, 'Requires MISSING A OR Requires MISSING B', ['MISSING A', 'MISSING B']), evaluate({ type: 'all', requirements: [ordinary, { type: 'any', requirements: [{ type: 'course', code: 'MISSING A' }, { type: 'course', code: 'MISSING B' }] }] }));

check('standing satisfied', result(true, '', []), evaluate({ type: 'standing', value: 'junior' }, { standing: 'junior' }));
check('standing unsatisfied', result(false, 'Requires junior', ['junior']), evaluate({ type: 'standing', value: 'junior' }));
check('section standing satisfied', result(true, '', []), evaluate({ type: 'standing', value: 'science_section' }, { sections: new Set(['science_section']) }));
check('section standing unsatisfied', result(false, 'Requires science_section', ['science_section']), evaluate({ type: 'standing', value: 'science_section' }));

check('min credit 86', result(false, 'Requires at least 87 qualifying credit hours', ['87']), evaluate({ type: 'min_credit_hours', value: 87 }, { completedCredits: 86 }));
check('min credit 87', result(true, '', []), evaluate({ type: 'min_credit_hours', value: 87 }, { completedCredits: 87 }));
check('min credit 88', result(true, '', []), evaluate({ type: 'min_credit_hours', value: 87 }, { completedCredits: 88 }));
check('min credit 0', result(false, 'Requires at least 87 qualifying credit hours', ['87']), evaluate({ type: 'min_credit_hours', value: 87 }, { completedCredits: 0 }));

check('external rule', result(true, '', []), evaluate({ type: 'external', label: 'High School Certificate' }));
check('unknown rule', result(false, 'Unknown prerequisite rule', []), evaluate({ type: 'future_rule' }));

const contextBefore = { programId: 'ai', standing: 'junior', sections: new Set(['science_section']), satisfiedReferenceCodes: new Set(['REF']), completedCredits: 87 };
const contextState = JSON.stringify({ ...contextBefore, sections: [...contextBefore.sections], satisfiedReferenceCodes: [...contextBefore.satisfiedReferenceCodes] });
evaluate({ type: 'all', requirements: [ordinary, { type: 'min_credit_hours', value: 87 }] }, contextBefore);
check('context immutability', contextState, JSON.stringify({ ...contextBefore, sections: [...contextBefore.sections], satisfiedReferenceCodes: [...contextBefore.satisfiedReferenceCodes] }));

const rule = { type: 'all', requirements: [{ type: 'course', code: 'MISSING A' }] };
const ruleBefore = JSON.stringify(rule);
evaluate(rule);
check('rule immutability', ruleBefore, JSON.stringify(rule));

context.progress.ai['AI-PREREQ-01'] = 'completed';
check('program isolation', result(false, 'Requires UNIQUE 101', ['UNIQUE 101']), evaluate(ordinary, { programId: 'bmd' }));
check('duplicate slot isolation', result(true, '', []), evaluate({ type: 'course', code: 'AIS 401', slotId: 'AI-S7-AIS-401-02' }));

console.log('PASS evaluator contract cases: 30');
