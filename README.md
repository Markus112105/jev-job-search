# applywithjev

Finds software internships and new-grad roles, rates each one against a
candidate, fills the application in Chrome, submits it, and keeps a CSV of
everything. Built for one job seeker; written so anyone can fork it with
their own profile.

Three parts do the work:

| Part | Role |
|---|---|
| [JEV](https://openrouter.ai/typesafe/jev-1.13) (`typesafe/jev-1.13` via OpenRouter) | Every typed decision: is this job a fit, which profile value fills this field, which dropdown option is right, what kind of page is this. Returns probabilities, not prose. About half a second and $0.00003 per call. |
| [Claude Code](https://code.claude.com) with [Claude in Chrome](https://code.claude.com/docs/en/chrome) | Drives the user's real browser, uploads the resume, writes the few free-text answers in the candidate's voice, handles anything JEV cannot type. |
| This CLI (TypeScript, Node 22) | Pulls job boards, filters, calls JEV, keeps the queue and the CSV, and turns a dumped form into a fill plan. |

A full discover run over about 4,500 postings rates roughly 450 fresh
software roles for under ten cents. Filling a typical Greenhouse, Lever or
Ashby form is one JEV call and one script injection.

## How a run works

```
/discover                      /apply (per job)
  sources ─┐                     next → open applyUrl
  simplify │                     dumpFields.js → fields.json
  github   ├→ dedupe → code      map-form (JEV) → plan.json
  boards   │  filters → fetch    fillFields.js, upload resume,
  sheet   ─┘  descriptions →     Claude writes drafts
            JEV rating →         submit → page-state (JEV)
            queue.json + CSV     mark applied → CSV
```

1. **Discover** (no browser). Reads the SimplifyJobs internship and new-grad
   lists, three community Canadian lists, and polls the Greenhouse, Lever and
   Ashby boards of every company those lists mention. Code removes what the
   candidate would never apply to (Workday and other account-walled portals,
   stale postings, non-software titles, US roles that say no sponsorship).
   JEV answers fourteen typed questions per remaining job and code turns
   them into a score and a ranked queue.
2. **Apply** (Claude Code on the user's Mac with Chrome). For each queued
   job: open the direct form URL, serialize every field with
   `src/forms/dumpFields.js`, ask JEV in one call which profile value or
   option fills each field, apply the plan with `src/forms/fillFields.js`,
   upload the resume, let Claude draft the one or two open questions from
   `data/voice.md` and the profile facts, submit, and classify the result
   page with JEV. The first three applications pause for the user's review.
3. **Record.** `data/applications.csv` has one row per job considered, in
   the same fifteen columns as the user's tracking sheet plus the tool's own
   (fit score, JEV confidence, ATS, source, posted date, skip reason).

## Setup

See `docs/SETUP.md`. In short:

```bash
git clone https://github.com/qbeka/applywithjev && cd applywithjev
npm install
cp .env.example .env                 # add your OpenRouter key
cp data/profile.example.json data/profile.json   # fill in your details
cp ~/Downloads/resume.pdf data/resume/resume.pdf
npx tsx src/cli.ts discover          # builds the queue, no browser needed
claude --chrome                      # then type /apply
```

Requires Node 22, Claude Code with the Claude in Chrome extension, and an
OpenRouter key. The profile, resume, queue and CSV are git-ignored.

## Commands

| Command | What it does |
|---|---|
| `discover [--no-boards] [--limit N]` | Build the queue and update the CSV |
| `queue [--all]` | Show queued jobs by score |
| `next [--peek]` | Best queued job as JSON, marked in progress |
| `map-form --fields f.json --job ID` | Turn a form dump into a fill plan with JEV |
| `page-state --text page.txt` | Classify a page: form, submitted, login, captcha, closed, error |
| `answer-context [--job ID] [--question "..."]` | Facts, voice rules and bank drafts for a free-text answer |
| `mark ID --status applied\|skipped\|failed\|blocked\|needs_review [--reason ...]` | Record an outcome |
| `status` | Totals and skip reasons |

Run any of them with `npx tsx src/cli.ts <command>`.

## Project structure

```
applywithjev/
├── .claude/skills/        apply, discover, profile: what Claude Code follows
├── src/
│   ├── cli.ts             commander entry point
│   ├── config.ts          every tunable: paths, thresholds, weights, limits
│   ├── discover.ts        sources → filters → describe → rate → queue
│   ├── jev/               Decisions API client, question builders, zod types
│   ├── profile/           profile schema; the canonical field keys JEV maps onto
│   ├── sources/           simplify, github lists, greenhouse/lever/ashby boards, sheet import
│   ├── jobs/              Job model, hard filters, JEV rating, queue
│   ├── forms/             dumpFields.js, fillFields.js, the mapper, page state
│   ├── answers/           answer bank and the context Claude drafts from
│   └── log/               the CSV
├── data/                  profile.example.json, voice.md; real data git-ignored
├── docs/                  ARCHITECTURE, JEV, SETUP, SOURCES, SAFETY
└── tests/                 vitest, offline, real captured fixtures
```

## Safety

The tool never lies on a form. Work authorization, education and dates come
from the profile and are not adjusted to fit a posting. It never creates
accounts, never solves CAPTCHAs (Claude in Chrome pauses and the user does),
never writes a cover letter, never volunteers a GPA, and never claims a fact
that is not in the profile. `docs/SAFETY.md` has the full list.

## License

MIT.
