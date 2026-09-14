# NU ITCS baseline harness

This harness is external to the production application and does not load or modify runtime code.

Run from the project root:

```text
node tests/baseline.js
```

It parses the authored `allTracksData` literal from `index.html`, checks slot identity, program counts, Summer membership, semester credit totals, runs isolated prerequisite/duplicate-slot contract cases, and writes deterministic snapshots to `tests/baseline/snapshots/`.

Browser behavior, real storage/migration behavior, keyboard navigation, and DOM recommendation execution require a browser test runner and are intentionally marked untested by this Phase 0.5 harness.
