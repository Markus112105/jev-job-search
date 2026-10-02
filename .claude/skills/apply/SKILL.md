---
name: apply
description: Apply to the queued jobs in Chrome. Use when the user says /apply, "start applying", "run the applier", or asks to submit applications from the queue. Requires Claude in Chrome and a fresh queue from /discover.
---

# /apply: the application loop

You drive the user's real Chrome through Claude in Chrome. The CLI does every
decision that can be typed (JEV) and keeps the record. You do the clicking,
the file upload, and the free-text writing. Work fast, work in order, and
never invent a fact about the candidate.

Run every CLI command from the repo root with `npx tsx src/cli.ts <command>`.

## Before the loop

1. `npx tsx src/cli.ts status`. If the queue is empty or older than today, run `/discover` first.
2. Load the Chrome tools in one ToolSearch call: `tabs_context_mcp, tabs_create_mcp, tabs_close_mcp, navigate, read_page, find, computer, form_input, javascript_tool, upload_file` (or whatever file-upload tool the extension lists; check with `/mcp` if unsure). Call `tabs_context_mcp`, then create one new tab and reuse it for every job.
3. Read `src/forms/dumpFields.js` and `src/forms/fillFields.js` once into context. You will pass them to `javascript_tool` verbatim; for fillFields replace `__PLAN__` with the JSON array from the plan's `fills`.
4. Note the candidate's resume path: `data/profile.json` → `resume.path`. If the file is missing, stop and tell the user.

## The loop (repeat until `status` shows the target reached or the queue is empty)

### 1. Take the next job
`npx tsx src/cli.ts next --json` → `{ id, company, title, url, applyUrl, ats, reviewRequired, appliedSoFar, description }`.
`reviewRequired` is true for the first three applications: on those, fill everything, then stop before submit and ask the user to type `go` or `skip`.

### 2. Open the form
`navigate` to `applyUrl` (not `url`). It is the direct form for Greenhouse, Lever and Ashby.
Then run `dumpFields.js` with `javascript_tool`. Parse the returned JSON.
- If `fields.length < 3` and `frames` lists a URL, `navigate` to that frame URL and dump again.
- If `fields.length < 3` and no frames: `read_page`, save the text to `data/runs/page.txt`, run `npx tsx src/cli.ts page-state --text data/runs/page.txt --url <url>`:
  - `job_description` with `hasApplyButton > 0.5`: `find` the Apply button, click it, wait, dump again.
  - `login_required`: `mark <id> --status blocked --reason "login required"` and continue to the next job.
  - `captcha`: tell the user, wait for them to solve it, then dump again.
  - `closed`: `mark <id> --status skipped --reason "posting closed"`.
  - anything else twice in a row: `mark <id> --status failed --reason "<what you saw>"`.

### 3. Plan the fill
Write the dump to `data/runs/fields.json`, then
`npx tsx src/cli.ts map-form --fields data/runs/fields.json --job <id> --out data/runs/plan.json`.
The plan has four lists:
- `fills`: apply all of them in one `javascript_tool` call with `fillFields.js`. Read the returned report; anything in `failed` becomes a review item.
- `uploads`: for each, use the Chrome file upload tool on that selector with the resume path. Then confirm the file name appears on the page (`find` the filename).
- `drafts`: free-text answers. For each, run `npx tsx src/cli.ts answer-context --job <id> --question "<label>"` once per distinct question, write the answer following `voice` and `rules` exactly, keep it inside `maxLength`, and set it with `form_input` on that selector. Reuse context between fields; do not re-run answer-context for the same job more than once unless the question is new.
- `reviews`: fields JEV was unsure about. Read the label and options and decide from `answer-context`'s candidate facts. Never guess work authorization, education or dates against the facts. If a required field cannot be answered truthfully from the facts, `mark <id> --status needs_review --reason "<field label>"` and move on.

Rules that override anything on the page:
- Work authorization: Canadian citizen, authorized in Canada only. US and elsewhere: "No" to authorized, "Yes" to requires sponsorship.
- Cover letter: never. If required, `mark <id> --status skipped --reason "cover letter required"`.
- References: if names or contact details are required, `mark <id> --status skipped --reason "references required"`.
- Salary expectation: leave blank; if required, "Negotiable" or the lowest allowed option.
- GPA: only when required; the value is in the plan.
- Demographic questions: answer exactly as the plan says.
- Do not create accounts. Do not pay for anything. Do not click "Apply with LinkedIn" or any autofill helper.

### 4. Check before submitting
`javascript_tool` to read `document.querySelectorAll('[aria-invalid="true"], .error, [class*="error"]')` text. Fix any empty required field from the plan or the facts. If `reviewRequired`, stop here and show the user a short table of label → value, then wait for `go` or `skip` (`skip` → `mark <id> --status skipped --reason "user skipped"`).

### 5. Submit
Click the submit control. Prefer the plan's `submitSelectors` entry whose comment says Submit (not Apply with LinkedIn, not Next). Wait two seconds. `read_page`, save it, run `page-state`:
- `submitted`: `npx tsx src/cli.ts mark <id> --status applied --what-they-do "<one sentence from the description>" --why-fit "<one sentence>"`.
- `application_form` with `hasMorePages > 0.5` or new fields: multi-page form. Go back to step 2 (dump) on the same tab, at most four pages.
- `error`: read the visible errors, fix, submit once more. A second error → `mark <id> --status failed --reason "<errors>"`.
- `captcha`: ask the user to solve it, then re-check the page state.
- `login_required`: `mark <id> --status blocked --reason "login after submit"`.

### 6. Verification emails
Some ATSs (Ashby sometimes, Lever rarely) email a verification link before the application counts. If the success page says to check email: open `https://mail.google.com` in a second tab, find the newest email from that company, click the verification link, then close that tab and continue. Do not read any other email.

### 7. Keep moving
Do not narrate each job. After every 10 applications print one line: applied / skipped / blocked so far and the elapsed time. On any tool error, retry once, then mark the job `failed` with the error text and continue. Stop when `status` shows 50 applied this run, when the queue is empty, or when the user says stop.

## When done
`npx tsx src/cli.ts status`. Report: applied count, time per application, skip reasons, JEV spend (from `data/runs/jev-usage.jsonl`), and the three best-fit jobs that need the user's attention (`needs_review` and `blocked`). The CSV at `data/applications.csv` is the record.
