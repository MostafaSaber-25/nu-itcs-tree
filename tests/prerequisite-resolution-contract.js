const fs = require('fs');
const vm = require('vm');

const curriculum = JSON.parse(fs.readFileSync('tests/baseline/snapshots/curriculum.snapshot.json', 'utf8')).slots;

const context = vm.createContext({
  normalizedCourses: {
    general: curriculum.filter(c => c.program === 'general'),
    ai: curriculum.filter(c => c.program === 'ai'),
    biomedical: curriculum.filter(c => c.program === 'biomedical'),
    cybersecurity: curriculum.filter(c => c.program === 'cybersecurity')
  }
});
context.window = context;
vm.runInContext(fs.readFileSync('js/core/prerequisites.js', 'utf8'), context, { filename: 'js/core/prerequisites.js' });

function check(name, expected, actual) {
  const expectedJson = JSON.stringify(expected);
  const actualJson = JSON.stringify(actual);
  if (expectedJson !== actualJson) throw new Error(`${name}: expected ${expectedJson}, actual ${actualJson}`);
  console.log(`PASS ${name}: expected=${expectedJson} actual=${actualJson}`);
}

function isArrayOfStrings(value) {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

const trackFor = { cs: 'general', ai: 'ai', bmd: 'biomedical', csec: 'cybersecurity' };
const resolve = (programId, code, slotId) => context.NUITCSPrerequisites.resolvePrerequisiteSlots({
  courses: context.normalizedCourses[trackFor[programId] || programId] || [],
  code,
  slotId
});
const ai401 = ['AI-S7-AIS-401-01', 'AI-S7-AIS-401-02'];

check('exact signature behavior: unique code', ['AI-S1-CSCI-101-01'], resolve('ai', 'CSCI 101'));
check('missing course code', [], resolve('ai', 'DOES NOT EXIST'));
check('explicit slot ID', ['AI-S7-AIS-401-01'], resolve('ai', 'AIS 401', ai401[0]));
check('wrong slot ID', [], resolve('ai', 'AIS 401', 'AI-S7-AIS-401-99'));
check('AIS401 code-only', ai401, resolve('ai', 'AIS 401'));
check('AIS401 slot #1', [ai401[0]], resolve('ai', 'AIS 401', ai401[0]));
check('AIS401 slot #2', [ai401[1]], resolve('ai', 'AIS 401', ai401[1]));
check('other duplicate code', ['AI-S7-AIS-CSCI-4XX-01', 'AI-S8-AIS-CSCI-4XX-01', 'AI-S8-AIS-CSCI-4XX-02'], resolve('ai', 'AIS/CSCI 4xx'));
check('placeholder duplicate', ['BIOMEDICAL-S6-BMD-3XX-01', 'BIOMEDICAL-S6-BMD-3XX-02'], resolve('bmd', 'BMD 3xx'));
check('cross-program isolation', ['AI-S1-CSCI-101-01'], resolve('ai', 'CSCI 101'));
check('cross-program code does not leak', [], resolve('cs', 'AIS 401'));
check('Summer course', ['AI-SUMMER-Y2-AIS-291-01'], resolve('ai', 'AIS 291'));
check('reference-only course', ['BIOMEDICAL-S1-BMD-100-01'], resolve('bmd', 'BMD 100'));

context.normalizedCourses.general.push({ slotId: 'GENERAL-VIRTUAL-SOPH-01', code: 'SOPH' });
check('virtual code has no direct filtering', ['GENERAL-VIRTUAL-SOPH-01'], resolve('cs', 'SOPH'));
check('null slot ID', ai401, resolve('ai', 'AIS 401', null));
check('undefined slot ID', ai401, resolve('ai', 'AIS 401'));
check('empty code', [], resolve('ai', ''));
check('unknown program', [], resolve('unknown-program', 'CSCI 101'));
check('match any does not alter resolver', ai401, resolve('ai', 'AIS 401'));

const returnCases = [
  resolve('ai', 'CSCI 101'),
  resolve('ai', 'DOES NOT EXIST'),
  resolve('ai', 'AIS 401'),
  resolve('ai', 'AIS 401', ai401[0])
];
check('every result is an Array', true, returnCases.every(Array.isArray));
check('every returned item is a slot ID string', true, returnCases.every(isArrayOfStrings));
check('multi-match ordering', ai401, resolve('ai', 'AIS 401'));

console.log(`PASS prerequisite-resolution contract cases: 20`);
