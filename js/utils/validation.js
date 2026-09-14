(function (global) {
  'use strict';

  function validateAuthoredSlotIds(allTracksData) {
    Object.entries(allTracksData).forEach(([trackId, courses]) => {
      const seen = new Set();
      courses.forEach(course => {
        if (typeof course.slotId !== 'string' || course.slotId.length === 0) {
          throw new Error(`Missing authored slotId: ${trackId}/${course.semester || `Summer ${course.year}`} ${course.code} ${course.titleEn}`);
        }
        if (seen.has(course.slotId)) throw new Error(`Duplicate authored slotId: ${trackId}/${course.slotId}`);
        seen.add(course.slotId);
      });
    });
  }

  function validateUniqueSlotIds(normalizedCourses) {
    const seen = new Set();
    Object.values(normalizedCourses).flat().forEach(course => {
      if (seen.has(course.slotId)) throw new Error(`Duplicate slotId: ${course.slotId}`);
      seen.add(course.slotId);
    });
  }

  function validateStudyPlanReferences(trackStudyPlans, courseRegistry) {
    const errors = [];
    Object.entries(trackStudyPlans || {}).forEach(([trackId, plan]) => {
      const trackRegistry = courseRegistry?.get(trackId);
      if (!trackRegistry) {
        errors.push(`Missing study-plan track reference: ${trackId}`);
        return;
      }
      if (!Array.isArray(plan)) {
        errors.push(`Malformed study-plan reference list: ${trackId}`);
        return;
      }
      plan.forEach((semester, periodIndex) => {
        if (!semester || !Array.isArray(semester.courses)) {
          errors.push(`Malformed study-plan period: ${trackId}/period-${periodIndex + 1}`);
          return;
        }
        semester.courses.forEach(slotId => {
          if (typeof slotId !== 'string' || slotId.length === 0) {
            errors.push(`Malformed study-plan slot reference: ${trackId}/${String(slotId)}`);
          } else if (!trackRegistry.has(slotId)) {
            errors.push(`Missing study-plan reference: ${trackId}/${slotId}`);
          }
        });
      });
    });
    if (errors.length) {
      throw new Error(`Study-plan reference validation failed:\n${errors.join('\n')}`);
    }
    return true;
  }

  global.NUITCSValidation = Object.freeze({
    validateAuthoredSlotIds,
    validateUniqueSlotIds,
    validateStudyPlanReferences
  });
})(window);
