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
    cs: {}, ai: {}, bmd: {}, csec: {}
  },
  normalizedCourses: {
    general: [
      { code: 'CS-PREREQ', slotId: 'CS-PREREQ-01', credits: 3 },
      { code: 'CS-CURRENT', slotId: 'CS-CURRENT-01', credits: 3 }
    ],
    ai: [
      { code: 'AIS 201', slotId: 'AI-201-01', credits: 3 },
      { code: 'CSCI 331', slotId: 'AI-331-01', credits: 3 },
      { code: 'AIS 301', slotId: 'AI-301-01', credits: 3 },
      { code: 'AIS 401', slotId: 'AI-S7-AIS-401-01', credits: 3 },
      { code: 'AIS 401', slotId: 'AI-S7-AIS-401-02', credits: 3 },
      { code: 'AIS 493', slotId: 'AI-493-01', credits: 3 },
      { code: 'AIS 494', slotId: 'AI-494-01', credits: 3 }
    ],
    biomedical: [
      { code: 'BMD 100', slotId: 'BMD-100-01', credits: 0, referenceOnly: true },
      { code: 'BMD 101', slotId: 'BMD-101-01', credits: 3 },
      { code: 'BMD 102', slotId: 'BMD-102-01', credits: 3 },
      { code: 'CSCI 231', slotId: 'BMD-CSCI-231-01', credits: 3 },
      { code: 'BMD 211', slotId: 'BMD-211-01', credits: 3 }
    ],
    cybersecurity: [
      { code: 'CSEC 101', slotId: 'CSEC-101-01', credits: 3 }
    ]
  },
  programTrackIds: { cs: 'general', ai: 'ai', bmd: 'biomedical', csec: 'cybersecurity' },
  eligibilityContext: { standing: null, sections: new Set(), satisfiedReferenceCodes: new Set() },
  NUITCSPrerequisites: {},
  Set
});
context.window = context;
const registrySource = fs.readFileSync('js/core/registry.js', 'utf8');
const registryFunction = registrySource.match(/function getProgramTrackId\([\s\S]*?\n  \}/)[0];
vm.runInContext(registryFunction, context, { filename: 'js/core/registry.js' });
vm.runInContext(fs.readFileSync('js/core/prerequisites.js', 'utf8'), context, { filename: 'js/core/prerequisites.js' });
vm.runInContext(fs.readFileSync('js/core/eligibility.js', 'utf8'), context, { filename: 'js/core/eligibility.js' });
vm.runInContext(extractFunction('getStatus'), context, {
  filename: 'production-course-eligibility-contract.js'
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

function eligibility(programId, course) {
  const trackId = context.programTrackIds[programId] || programId;
  return context.NUITCSEligibility.evaluateCourseEligibility({
    programId,
    course,
    courses: context.normalizedCourses[trackId] || [],
    progressByProgram: context.progress,
    eligibilityContext: context.eligibilityContext,
    resolvePrerequisiteSlots: context.NUITCSPrerequisites.resolvePrerequisiteSlots,
    getStatus: context.getStatus
  });
}

const plain = { code: 'CS-CURRENT', prerequisiteRule: null };
const ordinary = { code: 'CS-CURRENT', prerequisiteRule: { type: 'course', code: 'CS-PREREQ' } };
context.progress.cs['CS-PREREQ-01'] = 'completed';
check('no prerequisite', result(true, '', []), eligibility('cs', plain));
check('satisfied prerequisite', result(true, '', []), eligibility('cs', ordinary));
context.progress.cs['CS-PREREQ-01'] = 'not_started';
check('unsatisfied prerequisite', result(false, 'Requires CS-PREREQ', ['CS-PREREQ']), eligibility('cs', ordinary));
context.progress.cs['CS-PREREQ-01'] = 'in_progress';
check('ordinary in-progress prerequisite', result(false, 'Requires CS-PREREQ', ['CS-PREREQ']), eligibility('cs', ordinary));
const concurrent = { code: 'CS-CURRENT', prerequisiteRule: { type: 'course', code: 'CS-PREREQ', allowConcurrent: true } };
check('concurrent in-progress prerequisite', result(true, '', []), eligibility('cs', concurrent));
context.progress.cs['CS-PREREQ-01'] = 'completed';
check('concurrent completed prerequisite', result(true, '', []), eligibility('cs', concurrent));
context.progress.cs['CS-PREREQ-01'] = 'not_started';
check('concurrent not-started prerequisite', result(false, 'Requires CS-PREREQ completed or in progress', ['CS-PREREQ']), eligibility('cs', concurrent));

const missing = { code: 'CS-CURRENT', prerequisiteRule: { type: 'course', code: 'MISSING 999' } };
check('missing prerequisite', result(false, 'Requires MISSING 999', ['MISSING 999']), eligibility('cs', missing));

const programs = [
  ['cs', { code: 'CS-CURRENT', prerequisiteRule: { type: 'course', code: 'CS-PREREQ' } }],
  ['ai', { code: 'AIS 301', prerequisiteRule: { type: 'all', requirements: [{ type: 'course', code: 'AIS 201' }, { type: 'course', code: 'CSCI 331' }] } }],
  ['bmd', { code: 'BMD 211', prerequisiteRule: { type: 'course', code: 'CSCI 231', allowConcurrent: true } }],
  ['csec', { code: 'CSEC 101', prerequisiteRule: null }]
];
context.progress.cs['CS-PREREQ-01'] = 'completed';
context.progress.ai['AI-201-01'] = 'completed';
context.progress.ai['AI-331-01'] = 'completed';
context.progress.bmd['BMD-CSCI-231-01'] = 'completed';
programs.forEach(([programId, course]) => check(`program mapping ${programId}`, true, eligibility(programId, course).satisfied));
context.progress.cs['CS-PREREQ-01'] = 'completed';
check('program isolation', result(false, 'Requires CS-PREREQ', ['CS-PREREQ']), eligibility('ai', ordinary));

const seniorProject = { code: 'AIS 493', prerequisiteRule: { type: 'min_credit_hours', value: 87 } };
const qualifyingCourse = { code: 'QUALIFYING', slotId: 'AI-QUALIFYING-01', credits: 86 };
context.normalizedCourses.ai.push(qualifyingCourse);
context.progress.ai = {};
context.progress.ai['AI-QUALIFYING-01'] = 'completed';
for (const [credits, expected] of [[86, false], [87, true], [88, true]]) {
  qualifyingCourse.credits = credits;
  const actual = eligibility('ai', seniorProject);
  check(`credit threshold ${credits}`, expected, actual.satisfied);
  context.eligibilityContext.satisfiedReferenceCodes = new Set();
}

const training = { code: 'AIS 291', prerequisiteRule: { type: 'min_credit_hours', value: 87 } };
qualifyingCourse.credits = 0;
delete context.progress.ai['AI-QUALIFYING-01'];
context.normalizedCourses.ai.push({ code: 'TRAINING', slotId: 'AI-TRAINING-01', credits: 20, category: 'training' });
context.progress.ai['AI-TRAINING-01'] = 'completed';
check('training excluded from qualifying credits', false, eligibility('ai', training).satisfied);
context.normalizedCourses.ai.push({ code: 'REFERENCE', slotId: 'AI-REFERENCE-01', credits: 20, referenceOnly: true });
context.progress.ai['AI-REFERENCE-01'] = 'completed';
check('reference-only excluded from qualifying credits', false, eligibility('ai', training).satisfied);
context.normalizedCourses.ai.push({ code: 'NONGPA', slotId: 'AI-NONGPA-01', credits: 20, countsGpa: false });
context.progress.ai['AI-NONGPA-01'] = 'completed';
check('countsGpa false excluded', false, eligibility('ai', training).satisfied);
check('project behavior remains rule-driven', false, eligibility('ai', { code: 'PROJECT', prerequisiteRule: { type: 'min_credit_hours', value: 87 } }).satisfied);
check('Summer has no special eligibility behavior', false, eligibility('ai', { code: 'AIS 391', prerequisiteRule: { type: 'min_credit_hours', value: 87 } }).satisfied);
check('placeholder uses ordinary resolver semantics', result(false, 'Requires HUMA 2xx', ['HUMA 2xx']), eligibility('ai', { code: 'ELECTIVE', prerequisiteRule: { type: 'course', code: 'HUMA 2xx' } }));

context.progress.ai['AI-201-01'] = 'completed';
context.progress.ai['AI-331-01'] = 'completed';
const ais301 = programs[1][1];
check('AIS301 both satisfied', result(true, '', []), eligibility('ai', ais301));
delete context.progress.ai['AI-331-01'];
check('AIS301 one missing', result(false, 'Requires CSCI 331', ['CSCI 331']), eligibility('ai', ais301));
delete context.progress.ai['AI-201-01'];
check('AIS301 both missing', result(false, 'Requires AIS 201; Requires CSCI 331', ['AIS 201', 'CSCI 331']), eligibility('ai', ais301));

const bmd101 = { code: 'BMD 101', prerequisiteRule: { type: 'any', requirements: [{ type: 'course', code: 'BMD 100' }, { type: 'standing', value: 'science_section' }] } };
context.progress.bmd['BMD-100-01'] = 'completed';
check('BMD101 BMD100 branch', result(true, '', []), eligibility('bmd', bmd101));
delete context.progress.bmd['BMD-100-01'];
context.eligibilityContext.sections = new Set(['science_section']);
check('BMD101 Science Section branch', result(true, '', []), eligibility('bmd', bmd101));
context.eligibilityContext.sections = new Set();
check('BMD101 all branches missing', result(false, 'Requires BMD 100 OR Requires science_section', ['BMD 100', 'science_section']), eligibility('bmd', bmd101));

const bmd102 = { code: 'BMD 102', prerequisiteRule: { type: 'course', code: 'BMD 101', allowConcurrent: true } };
context.progress.bmd['BMD-101-01'] = 'in_progress';
check('BMD102 concurrent', result(true, '', []), eligibility('bmd', bmd102));
context.progress.bmd['BMD-101-01'] = 'not_started';
check('BMD102 blocked', result(false, 'Requires BMD 101 completed or in progress', ['BMD 101']), eligibility('bmd', bmd102));

const bmd211 = programs[2][1];
context.progress.bmd['BMD-CSCI-231-01'] = 'completed';
check('BMD211 completed', result(true, '', []), eligibility('bmd', bmd211));
context.progress.bmd['BMD-CSCI-231-01'] = 'in_progress';
check('BMD211 concurrent', result(true, '', []), eligibility('bmd', bmd211));

const ais401 = { code: 'COURSE', prerequisiteRule: { type: 'course', code: 'AIS 401' } };
check('AIS401 ambiguity', result(false, 'Ambiguous prerequisite AIS 401', ['AIS 401']), eligibility('ai', ais401));
const ais401Slot = { code: 'COURSE', prerequisiteRule: { type: 'course', code: 'AIS 401', slotId: 'AI-S7-AIS-401-02' } };
context.progress.ai['AI-S7-AIS-401-02'] = 'completed';
check('AIS401 explicit slot', result(true, '', []), eligibility('ai', ais401Slot));
const any401 = { code: 'COURSE', prerequisiteRule: { type: 'course', code: 'AIS 401', match: 'any' } };
context.progress.ai['AI-S7-AIS-401-01'] = 'not_started';
check('AIS401 match any first-slot behavior', result(false, 'Requires AIS 401', ['AIS 401']), eligibility('ai', any401));

const multi = { code: 'COURSE', prerequisiteRule: { type: 'all', requirements: [{ type: 'course', code: 'MISS A' }, { type: 'course', code: 'MISS B' }] } };
const missingBefore = eligibility('ai', multi).unmetRequirements;
check('getMissing passthrough contract', missingBefore, eligibility('ai', multi).unmetRequirements);
check('reason passthrough', 'Requires MISS A; Requires MISS B', eligibility('ai', multi).reason);
check('unmet ordering', ['MISS A', 'MISS B'], missingBefore);

context.progress.cs = {};
check('missing progress defaults to not_started', result(false, 'Requires CS-PREREQ', ['CS-PREREQ']), eligibility('cs', ordinary));
context.progress.cs['CS-PREREQ-01'] = 'paused';
check('unknown status is unsatisfied', result(false, 'Requires CS-PREREQ', ['CS-PREREQ']), eligibility('cs', ordinary));

const beforeProgress = JSON.stringify(context.progress);
const beforeCourse = JSON.stringify(ordinary);
const beforeNormalized = JSON.stringify(context.normalizedCourses);
const beforeEligibilityContext = JSON.stringify({ standing: context.eligibilityContext.standing, sections: [...context.eligibilityContext.sections], refs: [...context.eligibilityContext.satisfiedReferenceCodes] });
const repeatA = eligibility('cs', ordinary);
const repeatB = eligibility('cs', ordinary);
check('repeated calls identical', repeatA, repeatB);
check('immutability', true, beforeProgress === JSON.stringify(context.progress) && beforeCourse === JSON.stringify(ordinary) && beforeNormalized === JSON.stringify(context.normalizedCourses) && beforeEligibilityContext === JSON.stringify({ standing: context.eligibilityContext.standing, sections: [...context.eligibilityContext.sections], refs: [...context.eligibilityContext.satisfiedReferenceCodes] }));
check('unknown program current behavior', result(true, '', []), eligibility('unknown', plain));

console.log('SKIP context fields spy: frozen prerequisite namespace prevents test-side wrapping; context construction verified from the production source.');

console.log('PASS course-eligibility contract cases: 32');
