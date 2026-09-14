const fs = require('fs');
const vm = require('vm');

const source = fs.readFileSync('js/utils/validation.js', 'utf8');
const context = { window: {} };
vm.runInNewContext(source, context, { filename: 'js/utils/validation.js' });
const { validateStudyPlanReferences } = context.window.NUITCSValidation;

const registry = new Map([
  ['general', new Map([['CS-S1-01', {}], ['CS-S2-01', {}]])],
  ['ai', new Map([['AI-S1-01', {}]])]
]);
const validPlan = {
  general: [{ label: 'Semester 1', courses: ['CS-S1-01'] }, { label: 'Semester 2', courses: ['CS-S2-01'] }],
  ai: [{ label: 'Semester 1', courses: ['AI-S1-01'] }]
};

const assert = (condition, message) => { if (!condition) throw new Error(message); };
assert(validateStudyPlanReferences(validPlan, registry) === true, 'valid study plan did not pass');

function expectFailure(plan, ...needles) {
  try {
    validateStudyPlanReferences(plan, registry);
    throw new Error('invalid study plan passed silently');
  } catch (error) {
    needles.forEach(needle => assert(error.message.includes(needle), `missing diagnostic: ${needle}`));
  }
}

expectFailure({ missing: [{ courses: ['MISSING-01'] }] }, 'Missing study-plan track reference: missing');
expectFailure({ general: [{ courses: ['MISSING-01'] }] }, 'general/MISSING-01');
expectFailure({ general: [{ courses: [null, ''] }] }, 'general/null', 'general/');
expectFailure({ general: [{ courses: ['MISSING-A', 'MISSING-B'] }] }, 'general/MISSING-A', 'general/MISSING-B');
expectFailure({ general: 'malformed' }, 'Malformed study-plan reference list: general');

assert(validateStudyPlanReferences(validPlan, registry) === true, 'valid plan failed after invalid fixtures');
console.log('PASS: validation contract');
