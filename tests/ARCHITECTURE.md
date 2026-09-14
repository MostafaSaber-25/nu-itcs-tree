# NU ITCS Architecture Map and Dependency Contract

Read-only map of the current `index.html` implementation. This document does not redefine runtime schemas or authorize refactoring.

## Subsystems

| Subsystem | Current symbols | Responsibility |
|---|---|---|
| Data | `allTracksData`, `CS_TRACKS`, `CREDIT_BREAKDOWN` | Authored curriculum and program metadata |
| Normalization | `normalizeCategory`, `makeSlotId`, `buildPrerequisiteRule`, `formatPrerequisiteRule`, `normalizedCourses` | Adds runtime fields, term types, normalized categories, and executable prerequisite rules |
| Registry | `courseRegistry`, `getProgramCourse`, `resolvePrerequisiteSlots` | Slot identity lookup and prerequisite code resolution |
| Prerequisites | `prereqs`, `prereqText`, `prerequisiteRule`, `evaluatePrerequisite`, `evaluateCourseEligibility`, `getMissingPrerequisites`, `runPrerequisiteSelfTests` | Eligibility, warnings, concurrent rules, standing rules, and credit thresholds |
| Progress | `progress`, `getStatus`, `cycleStatus`, `computeProgress`, `validatePrerequisites` | Slot-based status state and derived completion |
| Storage | `STORAGE_KEY`, `loadProgress`, `saveProgress` | Local Storage persistence |
| Migration | `migrateLegacyProgress` | Backward compatibility for course-code-based saved state |
| Study plan | `studyPlanOrder`, `trackStudyPlans` | Chronological semester/Summer slot membership |
| Recommendations | `renderStudyPlan`, `evaluateCourseEligibility` | Current official period, ready/locked courses, completed exclusion |
| Statistics | `deriveCurriculumTotals`, `computeProgress` | Degree, GPA, training, project, category, and completion totals |
| UI | `buildCourseGrid`, `renderCatalog`, `renderStudyPlan`, `renderMajorGrid`, `selectProgram`, `renderTracks`, `refreshUI` | Map, catalog, recommendations, navigation, filters, search, and controls |

## Dependency graph

```text
allTracksData / CS_TRACKS / CREDIT_BREAKDOWN
                 |
                 v
        normalizedCourses
          /      |       \
         v       v        v
courseRegistry  trackStudyPlans  PROGRAMS
     |              |       |       \
     v              v       v        v
identity      recommendations  statistics  UI

normalized prerequisiteRule + progress + eligibilityContext
                         |
                         v
                evaluatePrerequisite
                         |
          warnings / unlocks / recommendations

loadProgress -> progress -> saveProgress
legacy storage -> migrateLegacyProgress -> progress
```

## Global mutable state

| State | Type/lifecycle | Writers/readers | Risk |
|---|---|---|---|
| `currentProgram` | nullable program id | `selectProgram`, `refreshUI` | Medium |
| `currentTrack` | CS track id | `renderTracks`, `refreshUI` | Medium |
| `treeView` | filter id | filter listeners, `buildCourseGrid` | Low |
| `progress` | program -> slotId -> status | load/migration/cycle/reset/import/self-tests | High |
| `eligibilityContext` | standing/sections/reference sets | prerequisite self-tests and runtime context | High |

## Public/internal contracts

- `getProgramCourse(programId, slotId)` returns one normalized course or `null`; identity is slot-based.
- `resolvePrerequisiteSlots(programId, code, slotId?)` returns candidate slot IDs; duplicate code ambiguity is retained.
- `evaluatePrerequisite(rule, context)` returns an eligibility result with satisfaction and unmet requirements.
- `getStatus(programId, slotId)` returns the stored status or `not_started`.
- `cycleStatus(programId, slotId)` validates prerequisites, advances the three-state cycle, persists, validates downstream courses, and refreshes UI.
- `loadProgress()` returns safe in-memory progress from `nu_itcs_progress_v1`.
- `saveProgress()` persists current progress and preserves in-memory state if persistence fails.
- `migrateLegacyProgress()` converts unambiguous legacy course-code entries to slot IDs.
- `deriveCurriculumTotals(courses)` returns total, GPA, training, and project credit totals.
- `refreshUI()` coordinates statistics, catalog, study-plan recommendations, and course-grid rendering.

## Current data shapes

### Authored course

`{ code, titleEn, credits, category, semester? or type/year, slotId, prereqs, optional prereqText, prerequisiteRule, referenceOnly, countsGpa, elective/track metadata }`

### Normalized course

Authored fields plus `programId`, `termType`, normalized `category`, `prerequisites`, executable `prerequisiteRule`, and generated fallback `prereqText`.

### Registry

`Map<trackId, Map<slotId, normalizedCourse>>`

### Progress

`{ [programId]: { [slotId]: 'not_started' | 'in_progress' | 'completed' } }`

### Study-plan period

`{ type: 'semester'|'summer', semester?/year?, label, courses: slotId[] }`

### Prerequisite rule

Current executable forms include `course`, `all`, `any`, `standing`, `min_credit_hours`, and `external`; course rules may include `allowConcurrent`.

## Mandatory invariants

1. 190 authored curriculum slots.
2. 190 explicit slot IDs, zero generated authored IDs, zero duplicates.
3. Four programs with unchanged membership.
4. Exact semester and Summer membership/order.
5. Exact course codes, titles, credits, categories, prerequisites, flags, and slot IDs.
6. Progress identity remains `program + slotId`.
7. Duplicate AI `AIS 401` slots remain independent.
8. BMD100 remains reference-only and does not become a curriculum credit.
9. Summer entries remain in Year 2 and Year 3 positions.
10. Totals and recommendation semantics remain unchanged.

## Candidate future module boundaries

Recommended only after baseline gates pass:

1. `utils/validation.js` — existing slot/study-plan/canonical validators; low risk.
2. `core/registry.js` — registry construction and slot lookup; medium risk.
3. `core/normalization.js` — normalization and prerequisite rule construction; high risk.
4. `core/prerequisites.js` — evaluation, resolution, warnings, self-tests; high risk.
5. `core/statistics.js` — totals and progress statistics; medium risk.
6. `services/storage.js` and `services/migration.js` — persistence boundary; high risk.
7. `core/progress.js` — state transitions and validation; high risk.
8. `core/recommendations.js` — official-period recommendation logic; high risk.
9. UI modules — map, catalog, recommendation, and stats renderers; medium risk.
10. `data/curriculum.js` — authored data extraction; high risk because of script-loading and exact-data identity.

## Cleanup status

- Safe to remove now: **None**.
- Legacy: `migrateLegacyProgress`, `makeSlotId` fallback, raw prerequisite compatibility fields.
- Keep: `courseRegistry`, `normalizedCourses`, `trackStudyPlans`, `PROGRAMS`, `CS_TRACKS`, `CREDIT_BREAKDOWN`, validators, self-tests, explicit slot IDs.
- Deferred: data extraction, CSS consolidation, prerequisite representation consolidation, compatibility retirement.

## Golden baseline contract

Run:

```text
node tests/baseline.js
node tests/runtime-harness.js
```

Every future extraction must compare the curriculum, prerequisite, study-plan, totals, and slot-ID snapshots. Roll back if identity, membership, prerequisites, progress keys, recommendations, Summer placement, totals, or critical UI behavior changes.

Production files modified: **NONE**.
