---
name: profile
description: Set up or check the candidate profile and voice. Use on first run, when the user says /profile, or when a form answer looked wrong. Validates data/profile.json, the resume path, and shows how answers will sound.
---

# /profile: the candidate's data

1. If `data/profile.json` does not exist, copy `data/profile.example.json`
   to it and ask the user for every value, one short block at a time:
   name, contact, address, links, education (with the GPA policy), work
   authorization, demographics (they may answer "prefer not to say"),
   preferences, resume path. Write the file. Never commit it; it is
   git-ignored.
2. Validate: `npx tsx src/cli.ts answer-context --question "tell us about yourself"`.
   A schema error names the field to fix.
3. Confirm the resume exists at `resume.path` and is a PDF under 5 MB.
4. Read `data/voice.md` with the user. Draft one sample answer to "Why do
   you want to work here?" for a made-up company and ask if it sounds like
   them. Adjust `data/voice.md` and the `facts` list until it does.
5. Remind them: anything not in `facts`, `experience` or `projects` will
   never appear in an application.
