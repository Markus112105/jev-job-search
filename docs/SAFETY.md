# Safety

*What this tool will not do, how it treats personal data, and what to
check before you publish a fork.*

## Never automated

| Rule | Where it lives |
|---|---|
| Lying on a form. Work authorization, citizenship, education, graduation date and employment dates come from `data/profile.json` and are not changed to fit a posting. | `src/forms/mapForm.ts` resolves authorization per country in code; the `/apply` skill forbids overriding it |
| Claiming a fact that is not in the profile. Free-text answers may use only `facts`, `experience`, `projects`, and the posting. | `data/voice.md`, `src/answers/context.ts`, the skill |
| Creating accounts on careers portals. Workday, iCIMS, Taleo, Oracle, SuccessFactors and Amazon Jobs are filtered out before rating. | `src/jobs/hardFilters.ts` |
| Solving CAPTCHAs. Claude in Chrome pauses on them and the user solves them by hand. | Claude Code behaviour; the skill waits |
| Paying for anything, or entering payment details. | The skill |
| Writing cover letters or volunteering a GPA. A required cover letter skips the job; a required GPA field gets the real number. | `src/profile/fieldKeys.ts`, `planField` |
| Supplying references. A posting that requires them is skipped and logged. | `src/jobs/rate.ts`, the skill |
| Clicking "Apply with LinkedIn" or resume-autofill helpers that would overwrite the plan. | `mapForm` skips autofill inputs; the skill |
| Submitting the first three applications without the user's "go". | `RUN.reviewFirst` in `src/config.ts`, the skill |

The user can still misrepresent themselves by putting false data in the
profile. The tool makes that the only way.

## Personal data

- The profile, resume, queue, CSV, HTTP cache and run logs are git-ignored
  (`.gitignore`). `data/profile.example.json` is fictional.
- The OpenRouter key is read from `.env` only. Error bodies are redacted
  before they are printed (`src/jev/client.ts`).
- What leaves the machine: job text and the profile's facts go to
  OpenRouter (JEV) on every rating and form-mapping call; the form values go
  to the employer's ATS; nothing goes anywhere else. There is no telemetry.
- JEV usage is appended to `data/runs/jev-usage.jsonl` (ids, token counts,
  cost; no content).
- Gmail is opened in Chrome only to click a verification link from a
  company you just applied to, and only when the success page asks for it.

## Terms of service

Automated form submission may be against the terms of a given job board
or ATS. The tool uses the user's own browser, their own identity, and
submits one application per posting at human-like pace, with the user
present. Read the terms of the sites you use and decide for yourself.

## Before open-sourcing a fork

```bash
git status --ignored | grep data/        # profile.json, resume, csv, queue must be ignored
git log -p | grep -i -E "sk-or-v1-|@gmail|phone" # nothing should match
npm audit --omit=dev
```

Replace the seed company list in `src/sources/companies.ts` if it does not
match your market, and rewrite `data/voice.md` in your own words.
