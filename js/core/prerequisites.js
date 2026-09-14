(function (global) {
  'use strict';

  function buildPrerequisiteRule(course, trackId) {
    if (course.prerequisiteRule) return course.prerequisiteRule;
    if (course.prerequisiteRules) return { type: 'all', requirements: course.prerequisiteRules.map(rule => ({ type: 'course', ...rule })) };
    if (trackId === 'ai' && course.code === 'AIS 301') {
      return { type: 'all', requirements: [{ type: 'course', code: 'AIS 201' }, { type: 'course', code: 'CSCI 331' }] };
    }
    if (trackId === 'biomedical' && course.code === 'BMD 101') {
      return { type: 'any', requirements: [{ type: 'course', code: 'BMD 100' }, { type: 'standing', value: 'science_section' }] };
    }
    if (trackId === 'biomedical' && course.code === 'BMD 102') {
      return { type: 'course', code: 'BMD 101', allowConcurrent: true };
    }
    if (trackId === 'biomedical' && course.code === 'BMD 211') {
      return { type: 'course', code: 'CSCI 231', allowConcurrent: true };
    }

    const requirements = (course.prereqs || []).map(code => {
      if (code === 'SOPH') return { type: 'standing', value: 'sophomore' };
      if (code === 'JUN') return { type: 'standing', value: 'junior' };
      if (code === 'Science Section') return { type: 'standing', value: 'science_section' };
      if (code === 'Math Section') return { type: 'standing', value: 'math_section' };
      if (code === 'SR87' || code === '87 Credit Hours' || code === 'Completing 87 Credit Hours') return { type: 'min_credit_hours', value: 87 };
      if (/High School|Placement Test|Track specific|Junior Level|None|MATH 120 \/ High School Math/i.test(code)) return { type: 'external', label: code };
      return { type: 'course', code };
    });
    return requirements.length === 0 ? null : requirements.length === 1 ? requirements[0] : { type: 'all', requirements };
  }

  function formatPrerequisiteRule(rule) {
    if (!rule) return '';
    if (rule.type === 'all') return rule.requirements.map(formatPrerequisiteRule).filter(Boolean).join(', ');
    if (rule.type === 'any') return rule.requirements.map(formatPrerequisiteRule).filter(Boolean).join(' OR ');
    if (rule.type === 'course') return `${rule.code}${rule.allowConcurrent ? ' OR concurrent' : ''}`;
    if (rule.type === 'standing') return rule.value === 'sophomore' ? 'Sophomore Standing' : rule.value === 'junior' ? 'Junior Standing' : rule.value.replace(/_/g, ' ');
    if (rule.type === 'min_credit_hours') return `Completing ${rule.value} Credit Hours or more`;
    return rule.label || '';
  }

  function getCompletedQualifyingCredits({ courses, progressByProgram, programId }) {
    return (courses || []).reduce((total, course) => {
      if (
        course.referenceOnly ||
        course.category === 'training' ||
        course.countsGpa === false ||
        progressByProgram?.[programId]?.[course.slotId] !== 'completed'
      ) return total;

      return total + (Number(course.credits) || 0);
    }, 0);
  }

  function resolvePrerequisiteSlots({ courses, code, slotId = null }) {
    return (courses || [])
      .filter(course => course.code === code && (!slotId || course.slotId === slotId))
      .map(course => course.slotId);
  }

  function evaluatePrerequisite(rule, context) {
    if (!rule) return { satisfied: true, reason: '', unmetRequirements: [] };
    if (rule.type === 'all') {
      const results = rule.requirements.map(item => evaluatePrerequisite(item, context));
      return { satisfied: results.every(result => result.satisfied), reason: results.filter(result => !result.satisfied).map(result => result.reason).join('; '), unmetRequirements: results.flatMap(result => result.unmetRequirements) };
    }
    if (rule.type === 'any') {
      const results = rule.requirements.map(item => evaluatePrerequisite(item, context));
      const winner = results.find(result => result.satisfied);
      return winner || { satisfied: false, reason: results.map(result => result.reason).join(' OR '), unmetRequirements: results.flatMap(result => result.unmetRequirements) };
    }
    if (rule.type === 'external') return { satisfied: true, reason: '', unmetRequirements: [] };
    if (rule.type === 'standing') {
      const satisfied = rule.value.endsWith('_section') ? context.sections.has(rule.value) : context.standing === rule.value;
      return { satisfied, reason: satisfied ? '' : `Requires ${rule.value}`, unmetRequirements: satisfied ? [] : [rule.value] };
    }
    if (rule.type === 'min_credit_hours') {
      const satisfied = context.completedCredits >= rule.value;
      return { satisfied, reason: satisfied ? '' : `Requires at least ${rule.value} qualifying credit hours`, unmetRequirements: satisfied ? [] : [String(rule.value)] };
    }
    if (rule.type === 'course') {
      const slots = context.resolvePrerequisiteSlots({
        courses: context.courses,
        code: rule.code,
        slotId: rule.slotId || null
      });
      if (slots.length === 0) {
        const satisfied = context.satisfiedReferenceCodes.has(rule.code);
        return { satisfied, reason: satisfied ? '' : `Requires ${rule.code}`, unmetRequirements: satisfied ? [] : [rule.code] };
      }
      if (slots.length > 1 && rule.match !== 'any') return { satisfied: false, reason: `Ambiguous prerequisite ${rule.code}`, unmetRequirements: [rule.code] };
      const status = context.getStatus(context.programId, slots[0]);
      const satisfied = status === 'completed' || (rule.allowConcurrent === true && status === 'in_progress');
      return { satisfied, reason: satisfied ? '' : `Requires ${rule.code}${rule.allowConcurrent ? ' completed or in progress' : ''}`, unmetRequirements: satisfied ? [] : [rule.code] };
    }
    return { satisfied: false, reason: 'Unknown prerequisite rule', unmetRequirements: [] };
  }

  global.NUITCSPrerequisites = Object.freeze({
    buildPrerequisiteRule,
    formatPrerequisiteRule,
    getCompletedQualifyingCredits,
    resolvePrerequisiteSlots,
    evaluatePrerequisite
  });
})(window);
