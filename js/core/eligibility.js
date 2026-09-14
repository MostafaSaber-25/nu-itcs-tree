(function (global) {
  'use strict';

  function evaluateCourseEligibility({
    programId,
    course,
    courses,
    progressByProgram,
    eligibilityContext,
    resolvePrerequisiteSlots,
    getStatus
  }) {
    const completedCredits = global.NUITCSPrerequisites.getCompletedQualifyingCredits({
      courses: courses || [],
      progressByProgram,
      programId
    });
    const context = {
      ...eligibilityContext,
      programId,
      completedCredits,
      courses: courses || [],
      resolvePrerequisiteSlots,
      getStatus
    };
    return global.NUITCSPrerequisites.evaluatePrerequisite(course.prerequisiteRule, context);
  }

  global.NUITCSEligibility = Object.freeze({ evaluateCourseEligibility });
})(window);
