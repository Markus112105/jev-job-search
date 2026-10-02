# Architecture

*How the pieces fit. Last verified 2026-10-02.*

## The split

| Who | Decides | Does not |
|---|---|---|
| **Code** (`src/`) | Which sources to read, deterministic filters (ATS, age, flags, title words), location tier from strings, work authorization per country, the score formula, what the CSV says | Judge meaning |
| **JEV** | Every typed judgement: fit questions per job, which key fills a field, which option, whether a checkbox applies, what kind of page this is | Write text, see pixels, hold state |
| **Claude Code** (via the skills) | Browser actions, resume upload, free-text answers, the fields JEV was unsure about, anything unexpected | Invent facts, override authorization, create accounts |

The rule of thumb: if a question has a finite set of answers, it is JEV's.
If it needs a sentence, it is Claude's. If it is a rule, it is code.

## Discover pipeline (`src/discover.ts`)

```
fetchSimplify ──┐
fetchReadmeSources ─┤
importSheet(data/imports/*.csv) ─┼→ dedupe → preFilter → describe → rateJob → entryFor → queue.json
boards (greenhouse / lever / ashby for every company seen) ─┘                                   └→ applications.csv
```

1. **Collect.** Sources run concurrently. Board polling keeps only
   early-career titles (`EARLY_CAREER_TITLE`) because boards list every
   role.
2. **Dedupe** by canonical URL. Merged records keep the richer fields.
3. **preFilter** (`src/jobs/hardFilters.ts`): account-walled ATSs, older
   than `DISCOVER.maxAgeDays`, titles that are plainly not software, French
   titles, advanced-degree-only, US with no-sponsorship or citizenship flags,
   unpaid. Reasons are kept and written to the CSV.
4. **describe** (`src/jobs/describe.ts`): ATS API text or page text, capped
   at `JEV.maxDescriptionChars`.
5. **rateJob** (`src/jobs/rate.ts`): one JEV call, fourteen questions,
   `scoreFromAnswers` turns them into a score, a decision and reasons.
6. **Queue** (`src/jobs/queue.ts`): sorted by score then recency. Entries
   from a previous run keep terminal statuses (applied, skipped, blocked) so
   nothing is applied to twice. Jobs already in a terminal state are not
   re-rated.

Timing on 2026-10-02: 4,748 unique postings, 478 rated, 61 seconds, $0.075.

## Apply loop (`.claude/skills/apply/SKILL.md`)

Per job, in the user's Chrome:

```
next ─→ navigate(applyUrl) ─→ dumpFields.js ─→ map-form (JEV) ─→ fillFields.js
                                   │                                 upload resume
                                   │                                 Claude drafts free text
                                   └─ <3 fields? frames / page-state ─→ click Apply, or mark blocked
submit ─→ read_page ─→ page-state (JEV) ─→ submitted: mark applied | form: next page | error: fix once
```

`applyUrl` (`applyUrlFor` in `src/jobs/normalize.ts`) is the direct form:
Greenhouse's server-rendered embed page, Lever's `/apply`, Ashby's
`/application`. That skips the company's marketing page and its scripts.

### The form contract (`src/forms/fields.ts`)

- `dumpFields.js` runs in the page and returns a `FieldsDump`: every
  visible control with a stable `id` (f0, f1, …), a CSS `selector` that
  finds it again, `kind`, `label` (from `<label for>`, aria attributes, the
  enclosing label, or the nearest heading), `hint`, `required`, current
  `value`, `options` for selects, radios, button groups and open
  comboboxes, plus the submit buttons and any embedded ATS iframes.
- `mapForm` sends the fields and the candidate's facts to JEV in chunks of
  `FORM.fieldsPerCall` and returns a `FillPlan`: per field an `action`
  (`fill`, `upload`, `draft`, `skip`, `review`), the chosen `key`, the
  `value`, and `confidence`; plus the four ready-to-use lists `fills`,
  `uploads`, `drafts`, `reviews`.
- `fillFields.js` applies `fills` in one pass: native value setters so React
  sees the change, `input` and `change` events, select by value then label,
  radios and button groups by label, checkboxes by click, comboboxes by
  typing then clicking the matching visible option. It returns what was
  applied and what failed.

### Speed budget

Per form page: one `navigate`, one `javascript_tool` (dump), one CLI call
(JEV, about a second), one `javascript_tool` (fill), one upload, zero to
two `form_input` calls for drafts, one click, one `read_page`, one CLI call
(page state). About eight to ten tool calls and two JEV calls. Claude's own
thinking and the drafts are the variable cost. Expect 20 to 30 applications
an hour on Greenhouse, Lever and Ashby at first; the two cheapest speedups
are batching navigate+dump into one `browser_batch` call and pre-drafting
the bank answers per company before the loop.

## Files

| Path | Format | Written by | Read by |
|---|---|---|---|
| `data/profile.json` | `ProfileSchema` | the user | everything |
| `data/queue.json` | `QueueFile` v1 | discover, `next`, `mark` | `next`, `status`, `map-form`, `answer-context` |
| `data/applications.csv` | 25 columns, first 15 match the user's sheet | discover, `mark` | the user |
| `data/runs/jev-usage.jsonl` | one JSON object per JEV call | `JevClient` | `status`, the user |
| `data/runs/fields.json`, `plan.json`, `page.txt` | scratch for the current job | the skill | the skill |
| `data/cache/http/` | cached GET bodies keyed by URL hash | `getText` | `getText` |

## Why not a Chrome extension or Playwright

A custom extension or a Playwright script would be faster per form but
would need its own login state, its own CAPTCHA story, and its own
judgement for the unexpected. Claude in Chrome already has the user's
sessions and can look at a page when the plan does not fit. The code is
arranged so the browser layer could be swapped (the scripts are plain
JavaScript, the CLI is stateless per call), but version one leans on the
extension on purpose.
