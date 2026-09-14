(function (global) {
  'use strict';

  function buildCourseRegistry(normalizedCourses) {
    return new Map(Object.entries(normalizedCourses).map(([trackId, courses]) => [
      trackId,
      new Map(courses.map(course => [course.slotId, course]))
    ]));
  }

  function getProgramTrackId(programTrackIds, programId) {
    return programTrackIds[programId] || programId;
  }

  function getProgramCourse(registry, programTrackIds, programId, slotId) {
    return registry.get(getProgramTrackId(programTrackIds, programId))?.get(slotId) || null;
  }

  global.NUITCSRegistry = Object.freeze({
    buildCourseRegistry,
    getProgramTrackId,
    getProgramCourse
  });
})(window);
