# Contributing

Thanks for looking. This project is small and opinionated; the fastest way
to help is a focused pull request with a test.

## Setup

```bash
git clone https://github.com/qbeka/applywithjev && cd applywithjev
npm install
npx vitest run
```

Node 22 (`.nvmrc`). No build step; everything runs through `tsx`.

## Where things go

- A new job board: `src/sources/`, then call it from `collectJobs` in
  `src/discover.ts`. Add a fixture under `tests/fixtures/` and a parser
  test. `docs/SOURCES.md` explains the contract.
- A new kind of form control: `src/forms/dumpFields.js` (capture it),
  `src/forms/fillFields.js` (set it), `src/forms/mapForm.ts` (ask JEV about
  it). Capture a blank real form as a fixture; never a filled one.
- A new thing JEV should decide: write the question with criteria that are
  definitions, add it next to its siblings, and document it in
  `docs/JEV.md`.
- Any threshold, weight, timeout or URL: `src/config.ts` only.

## Rules

- Never commit personal data, keys, or real resumes. CI fails if the
  ignored files show up or a key pattern appears.
- Every external payload goes through a zod schema.
- Prose has no em dashes. Commits are Conventional Commits
  (`feat(forms): handle button groups`). No AI attribution trailers.
- Keep dependencies at two runtime packages unless there is a strong
  reason.

## Before you push

```bash
npx tsc --noEmit && npx vitest run && npm audit --omit=dev
```

## Code of conduct

Be decent. See `CODE_OF_CONDUCT.md`.
