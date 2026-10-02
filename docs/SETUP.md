# Setup (macOS)

*Fifteen minutes the first time. Last verified 2026-10-02.*

## 1. Prerequisites

- **Node 22 or newer**: `node --version`. Install from nodejs.org or `brew install node`.
- **Google Chrome** with the [Claude in Chrome extension](https://chromewebstore.google.com/detail/claude/fcoeoabgfenejglbffodgkkbkcdhcgfn) (version 1.0.36 or later).
- **Claude Code** signed in with `/login` on a Pro, Max, Team or Enterprise plan. API-key logins cannot use Chrome.
- An **OpenRouter** account and key from https://openrouter.ai/keys. Put a few dollars of credit on it; a full run costs cents.

## 2. Clone and install

```bash
git clone https://github.com/qbeka/applywithjev
cd applywithjev
npm install
npx vitest run        # everything should pass offline
```

## 3. The key

```bash
cp .env.example .env
```

Edit `.env` and set `OPENROUTER_API_KEY=sk-or-v1-…`. The file is
git-ignored. If a key has ever been pasted into a chat, an issue, or a
screenshot, rotate it at openrouter.ai/keys first.

## 4. Your profile

```bash
cp data/profile.example.json data/profile.json
```

Fill in every field. The schema is in `src/profile/schema.ts`; the
important choices:

- `education[0].gpa.volunteer`: `false` means the GPA is only entered when a
  form will not submit without it.
- `workAuthorization`: list only the countries where you can work without
  sponsorship. `statement` is used verbatim when a form asks you to explain.
- `demographics`: answer as you want them answered, including "Prefer not
  to say".
- `preferences.salaryExpectation`: leave empty to never volunteer a number.
- `facts`: the only claims Claude may make in a written answer. Keep every
  number exact.
- `summary`: three or four sentences; this is the candidate side of every
  fit rating, so say what you want, where, and when.

Then put your resume at `data/resume/resume.pdf` and set `resume.path` to
its absolute path, for example `/Users/you/applywithjev/data/resume/resume.pdf`.

Check it: `npx tsx src/cli.ts answer-context --question "tell us about yourself"`
prints your facts back; a schema error names the field to fix.

## 5. Your voice

Read `data/voice.md`. It is the style guide for every free-text answer.
Edit it until a sample answer sounds like you. Run `/profile` inside Claude
Code to do this interactively.

## 6. Optional: your existing tracker

Export your tracking sheet as CSV (File → Download → CSV) into
`data/imports/`. Rows not marked applied join the queue on the next
discover. The output CSV uses the same first fifteen columns, so it pastes
back into the sheet.

## 7. First discover

```bash
npx tsx src/cli.ts discover
```

About a minute. It prints totals and the top 50. `npx tsx src/cli.ts status`
shows skip reasons. `data/queue.json` and `data/applications.csv` now exist.

## 8. First apply run

```bash
claude --chrome
```

Approve the Chrome connection the first time (`/chrome` shows status). Then
type `/apply`. The first three applications are filled and then paused:
review the field table Claude prints, type `go` to submit or `skip` to
move on. After three, it runs on its own. Stay at the computer: Claude in
Chrome pauses for CAPTCHAs and logins and asks you to handle them.

To stop at any time, say "stop". `npx tsx src/cli.ts status` and
`data/applications.csv` show what happened.

## Updating

```bash
git pull && npm install
```

Your `data/` files are untouched by updates.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `OPENROUTER_API_KEY is not set` | Create `.env` as in step 3 |
| `No profile at data/profile.json` | Step 4 |
| Chrome tools missing in Claude Code | `/chrome`, then "Reconnect extension"; make sure you signed in with `/login`, not an API key |
| A site will not let Claude act | Allow it in the extension's site permissions when prompted |
| Form fields not found on a job page | The job page was the description, not the form. The skill handles this (Apply button, embedded frame). If it persists for one ATS, open an issue with the URL |
| JEV 429 | The client retries; if it keeps failing, lower `rateConcurrency` in `src/config.ts` |
