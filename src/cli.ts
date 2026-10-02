#!/usr/bin/env -S npx tsx
/**
 * applywithjev command line. Claude Code calls these from the apply skill;
 * you can run them by hand too. Every command prints JSON with --json so
 * the output is machine-readable.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { Command } from "commander";
import { loadEnv, DISCOVER, RUN } from "./config.js";
import { discover } from "./discover.js";
import { JevClient } from "./jev/client.js";
import { applyUrlFor } from "./jobs/normalize.js";
import { loadQueue, nextQueued, saveQueue, sortEntries, updateEntry, QueueStatus, type QueueEntry } from "./jobs/queue.js";
import { loadRows, saveRows, upsertEntry } from "./log/csv.js";
import { loadProfile } from "./profile/schema.js";
import { answerContext } from "./answers/context.js";
import { mapForm } from "./forms/mapForm.js";
import { decidePageState } from "./forms/pageState.js";
import { FieldsDump } from "./forms/fields.js";

loadEnv();
const program = new Command();
program.name("applywithjev").description("Find, rate and apply to software jobs with JEV, Claude Code and Claude in Chrome.").version("0.1.0");

const out = (data: unknown, json: boolean, human: () => void) => (json ? console.log(JSON.stringify(data, null, 2)) : human());

program
  .command("discover")
  .description("Pull every source, filter, rate with JEV, and write data/queue.json and data/applications.csv")
  .option("--no-boards", "skip polling company boards directly")
  .option("--limit <n>", "rate at most n new jobs (for a quick test)", (v) => parseInt(v, 10))
  .option("--json", "print the summary as JSON")
  .action(async (o: { boards: boolean; limit?: number; json?: boolean }) => {
    const profile = loadProfile();
    const jev = new JevClient();
    const { queue, summary } = await discover(profile, jev, {
      boards: o.boards,
      ...(o.limit !== undefined ? { limit: o.limit } : {}),
      log: (l) => console.error(l),
    });
    const top = sortEntries(queue.entries.filter((e) => e.status === "queued")).slice(0, RUN.targetPerRun);
    out({ summary, top: top.map(brief) }, !!o.json, () => {
      console.log(`\n${summary.unique} unique postings, ${summary.preFiltered} removed by code filters, ${summary.rated} rated by JEV.`);
      console.log(`${summary.queued} queued (score ≥ ${DISCOVER.applyThreshold}), ${summary.belowThreshold} below threshold, ${summary.skippedByJev} skipped by JEV.`);
      console.log(`JEV: ${summary.jevCalls} calls, $${summary.jevCostUsd.toFixed(4)}.\n`);
      printTable(top);
    });
  });

program
  .command("queue")
  .description("Show the queue")
  .option("--all", "include skipped and applied entries")
  .option("--limit <n>", "rows to show", (v) => parseInt(v, 10), 50)
  .option("--json")
  .action((o: { all?: boolean; limit: number; json?: boolean }) => {
    const q = loadQueue();
    const entries = sortEntries(o.all ? q.entries : q.entries.filter((e) => e.status === "queued")).slice(0, o.limit);
    out(entries.map(brief), !!o.json, () => printTable(entries));
  });

program
  .command("next")
  .description("Print the best queued job and mark it in progress")
  .option("--peek", "do not change its status")
  .option("--json")
  .action((o: { peek?: boolean; json?: boolean }) => {
    const q = loadQueue();
    const e = nextQueued(q);
    if (!e) {
      out({ done: true }, !!o.json, () => console.log("Queue is empty. Run discover."));
      return;
    }
    if (!o.peek) {
      updateEntry(q, e.job.id, { status: "in_progress", attempts: e.attempts + 1 });
      saveQueue(q);
    }
    const applied = q.entries.filter((x) => x.status === "applied").length;
    const payload = { ...brief(e), applyUrl: applyUrlFor(e.job as { url: string; ats: import("./jobs/normalize.js").Ats }), description: e.job.description ?? "", reviewRequired: applied < RUN.reviewFirst, appliedSoFar: applied };
    out(payload, !!o.json, () => console.log(JSON.stringify(payload, null, 2)));
  });

program
  .command("mark <id>")
  .description("Set a job's status: applied | skipped | failed | blocked | needs_review | queued")
  .requiredOption("--status <status>")
  .option("--reason <text>")
  .option("--notes <text>")
  .option("--what-they-do <text>", "fills the sheet's What They Do column")
  .option("--why-fit <text>", "fills the sheet's Why You're a Fit column")
  .action((id: string, o: { status: string; reason?: string; notes?: string; whatTheyDo?: string; whyFit?: string }) => {
    const status = QueueStatus.parse(o.status);
    const q = loadQueue();
    const e = updateEntry(q, id, {
      status,
      statusReason: o.reason ?? null,
      ...(o.notes ? { notes: o.notes } : {}),
      ...(status === "applied" ? { appliedAt: new Date().toISOString() } : {}),
    });
    saveQueue(q);
    let rows = loadRows();
    rows = upsertEntry(rows, e, {
      ...(o.whatTheyDo ? { "What They Do": o.whatTheyDo } : {}),
      ...(o.whyFit ? { "Why You're a Fit": o.whyFit } : {}),
      ...(o.notes ? { Notes: o.notes } : {}),
    });
    saveRows(rows);
    console.log(`${e.job.company} | ${e.job.title} → ${status}${o.reason ? ` (${o.reason})` : ""}`);
  });

program
  .command("map-form")
  .description("Map a dumped form (from dumpFields.js) to a fill plan with JEV")
  .requiredOption("--fields <file>", "JSON produced by dumpFields.js")
  .requiredOption("--job <id>", "queue entry id, for context")
  .option("--out <file>", "write the plan here as well as printing it")
  .action(async (o: { fields: string; job: string; out?: string }) => {
    const profile = loadProfile();
    const jev = new JevClient();
    const q = loadQueue();
    const entry = q.entries.find((e) => e.job.id === o.job);
    if (!entry) throw new Error(`No queue entry ${o.job}`);
    const dump = FieldsDump.parse(JSON.parse(readFileSync(o.fields, "utf8")));
    const plan = await mapForm(jev, profile, entry.job as unknown as import("./jobs/normalize.js").Job, dump);
    const json = JSON.stringify(plan, null, 2);
    if (o.out) writeFileSync(o.out, json);
    console.log(json);
  });

program
  .command("page-state")
  .description("Classify a page's text: form, success, login, captcha, closed, error")
  .requiredOption("--text <file>", "plain text of the page (from read_page or innerText)")
  .option("--url <url>")
  .action(async (o: { text: string; url?: string }) => {
    const jev = new JevClient();
    const res = await decidePageState(jev, readFileSync(o.text, "utf8"), o.url ?? "");
    console.log(JSON.stringify(res, null, 2));
  });

program
  .command("answer-context")
  .description("Print everything Claude needs to draft a free-text answer in the candidate's voice")
  .option("--job <id>")
  .option("--question <text>", "the question being answered, to pick the closest bank answer")
  .action((o: { job?: string; question?: string }) => {
    const profile = loadProfile();
    const q = loadQueue();
    const entry = o.job ? q.entries.find((e) => e.job.id === o.job) ?? null : null;
    console.log(JSON.stringify(answerContext(profile, entry, o.question ?? ""), null, 2));
  });

program
  .command("status")
  .description("Run summary: applied, skipped by reason, JEV spend")
  .option("--json")
  .action((o: { json?: boolean }) => {
    const q = loadQueue();
    const by = (s: QueueEntry["status"]) => q.entries.filter((e) => e.status === s);
    const reasons: Record<string, number> = {};
    for (const e of q.entries) if (e.status !== "queued" && e.status !== "applied") reasons[e.statusReason ?? e.status] = (reasons[e.statusReason ?? e.status] ?? 0) + 1;
    const summary = {
      generatedAt: q.generatedAt,
      total: q.entries.length,
      applied: by("applied").length,
      queued: by("queued").length,
      inProgress: by("in_progress").length,
      needsReview: by("needs_review").length,
      blocked: by("blocked").length,
      failed: by("failed").length,
      skipped: by("skipped").length,
      appliedToday: by("applied").filter((e) => (e.appliedAt ?? "").slice(0, 10) === new Date().toISOString().slice(0, 10)).length,
      topSkipReasons: Object.entries(reasons).sort((a, b) => b[1] - a[1]).slice(0, 12),
    };
    out(summary, !!o.json, () => {
      console.log(`Queue from ${summary.generatedAt}`);
      console.log(`applied ${summary.applied} (today ${summary.appliedToday}) | queued ${summary.queued} | in progress ${summary.inProgress} | needs review ${summary.needsReview} | blocked ${summary.blocked} | failed ${summary.failed} | skipped ${summary.skipped}`);
      for (const [r, n] of summary.topSkipReasons) console.log(`  ${String(n).padStart(4)}  ${r}`);
    });
  });

function brief(e: QueueEntry) {
  return {
    id: e.job.id,
    company: e.job.company,
    title: e.job.title,
    url: e.job.url,
    ats: e.job.ats,
    locations: e.job.locations,
    postedAt: e.job.postedAt,
    score: e.fit?.score ?? null,
    status: e.status,
    reason: e.statusReason,
    notes: e.fit?.reasons ?? [],
  };
}

function printTable(entries: QueueEntry[]) {
  for (const e of entries) {
    const score = e.fit ? e.fit.score.toFixed(2) : "  -  ";
    console.log(`${score}  ${e.job.postedAt ?? "          "}  ${e.job.ats.padEnd(13)} ${e.job.company.slice(0, 28).padEnd(28)} ${e.job.title.slice(0, 60).padEnd(60)} ${e.job.locations.join(" / ").slice(0, 40)}  [${e.job.id}]`);
  }
}

program.parseAsync(process.argv).catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
