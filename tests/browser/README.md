# External Browser QA

The full browser matrix is executed through the Codex CUA/Playwright browser
against `http://localhost:8000/`. This directory contains only QA artifacts and
does not participate in application runtime.

Known tooling limits:

- Network-event inspection is unavailable.
- Direct `localStorage` object inspection is unavailable in the browser
  evaluation context; persistence is verified only through reload behavior.
