(function (global) {
  'use strict';

  const COURSE_CATEGORIES = Object.freeze({
    MATH: 'math', SCIENCE: 'science', BASIC_COMPUTING: 'basic_computing',
    SPECIALIZATION: 'specialization', HUMANITIES: 'humanities', ENGLISH: 'english',
    PROJECT: 'project', TRAINING: 'training'
  });

  const normalizeCategory = category => category === 'basic computing'
    ? COURSE_CATEGORIES.BASIC_COMPUTING
    : category;

  const makeSlotId = (trackId, course, occurrence) => {
    const token = course.code.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toUpperCase();
    const period = course.type === 'summer' ? `SUMMER-Y${course.year}` : `S${course.semester}`;
    return `${trackId.toUpperCase()}-${period}-${token}-${String(occurrence).padStart(2, '0')}`;
  };

  function normalizeCourse(course, trackId, occurrence, { buildPrerequisiteRule, formatPrerequisiteRule }) {
    const termType = course.referenceOnly ? 'reference' : course.type === 'summer' ? 'summer' : 'regular';
    const prerequisites = course.prereqs || [];
    const prerequisiteRule = buildPrerequisiteRule(course, trackId);
    return {
      ...course,
      programId: trackId,
      termType,
      slotId: course.slotId || makeSlotId(trackId, course, occurrence),
      category: normalizeCategory(course.category),
      prerequisites,
      prereqs: prerequisites,
      prerequisiteRule,
      prereqText: course.prereqText || formatPrerequisiteRule(prerequisiteRule)
    };
  }

  function normalizeCurriculum(allTracksData, dependencies) {
    return Object.fromEntries(Object.entries(allTracksData).map(([trackId, entries]) => {
      const occurrences = new Map();
      return [trackId, entries.map(course => {
        const occurrenceKey = `${course.semester}:${course.code}`;
        const occurrence = (occurrences.get(occurrenceKey) || 0) + 1;
        occurrences.set(occurrenceKey, occurrence);
        return normalizeCourse(course, trackId, occurrence, dependencies);
      })];
    }));
  }

  global.NUITCSNormalization = Object.freeze({
    normalizeCategory,
    makeSlotId,
    normalizeCourse,
    normalizeCurriculum
  });
})(window);
