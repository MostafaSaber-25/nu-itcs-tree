(function (global) {
  'use strict';

  function deriveCurriculumTotals(courses, virtualCodes = []) {
    const counted = courses.filter(course => !course.referenceOnly && !virtualCodes.includes(course.code));
    const creditsFor = predicate => counted.reduce((sum, course) => predicate(course) ? sum + (Number(course.credits) || 0) : sum, 0);
    const trainingCredits = creditsFor(course => course.category === 'training');
    const projectCredits = creditsFor(course => course.category === 'project');
    const total = creditsFor(() => true);
    return {
      total,
      trainingCredits,
      projectCredits,
      gpaCredits: total - trainingCredits
    };
  }

  function computeProgress({ courses, progressByProgram, programId, graduation, virtualCodes = [] }) {
    const statuses = progressByProgram[programId] || {};
    let gpaDone = 0, totalDone = 0;
    const byCat = {};
    courses.forEach(course => {
      if (virtualCodes.includes(course.code)) return;
      const status = statuses[course.slotId];
      if (status !== 'completed') return;
      if (course.category !== 'training' && course.countsGpa !== false) gpaDone += course.credits;
      totalDone += course.credits;
      byCat[course.category] = (byCat[course.category] || 0) + course.credits;
    });
    return {
      gpaDone,
      gpaTotal: graduation.gpaCredits,
      totalDone,
      totalRequired: graduation.total,
      byCat,
      percentGpa: Math.min(100, (gpaDone / graduation.gpaCredits) * 100),
      percentTotal: Math.min(100, (totalDone / graduation.total) * 100)
    };
  }

  global.NUITCSStatistics = Object.freeze({ deriveCurriculumTotals, computeProgress });
})(window);
