const fs = require('fs');
const source = fs.readFileSync('index.html', 'utf8');

const warningStart = source.indexOf('function checkPrereqWarning(course)');
const warningEnd = source.indexOf('\n  function renderMajorGrid()', warningStart);
if (warningStart < 0 || warningEnd < 0) throw new Error('warning function not found');

const warningFn = source.slice(warningStart, warningEnd);
if (!warningFn.includes('getMissingPrerequisites(currentProgram, course)')) {
  throw new Error('warning function does not consume missing prerequisites');
}
if (!warningFn.includes("alert.classList.add('show')")) {
  throw new Error('warning function does not show the banner');
}
if (/if\s*\(st\s*===\s*['"]not_started['"]\)/.test(warningFn)) {
  throw new Error('warning function still hides blocked not-started warnings');
}

const cycleStart = source.indexOf('function cycleStatus(programId, slotId)');
const cycleEnd = source.indexOf('\n  function ', cycleStart + 10);
const cycleFn = source.slice(cycleStart, cycleEnd < 0 ? source.length : cycleEnd);
if (!cycleFn.includes('checkPrereqWarning(course)')) throw new Error('cycleStatus does not trigger warnings');
if (!cycleFn.includes('ring-yellow-500')) throw new Error('cycleStatus does not preserve prerequisite highlighting');

const selectStart = source.indexOf('function selectProgram(id)');
const selectEnd = source.indexOf('\n  function renderTracks(prog)', selectStart);
const selectFn = source.slice(selectStart, selectEnd);
if (!selectFn.includes("prereqAlert.classList.remove('show')")) {
  throw new Error('program switching does not clear warning visibility');
}
if (!selectFn.includes("prereqAlert.textContent = ''")) {
  throw new Error('program switching does not clear warning text');
}

console.log('PASS: prerequisite warning contract');
