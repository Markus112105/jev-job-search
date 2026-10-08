/**
 * Reads a CSV export of the user's tracking sheet (the same fifteen columns
 * as applications/all.csv) and turns rows that are not yet applied into
 * jobs for the pipeline.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { parseCsv } from "../log/csv.js";
import { atsFromUrl, canonicalUrl, jobId, type Job } from "../jobs/normalize.js";

export type TrackedApplication = {
  company: string;
  title: string;
  term: string;
  status: "submitted" | "in_progress";
};

const trackedStatus = (value: string): TrackedApplication["status"] | null => {
  const status = value.trim().toLowerCase();
  if (/^(submitted|applied)/.test(status)) return "submitted";
  if (/^in[ -]?progress/.test(status)) return "in_progress";
  return null;
};

/** Reads completed and active applications even when the old tracker has no posting links. */
export function parseTrackedApplications(text: string): TrackedApplication[] {
  const [header, ...rows] = parseCsv(text);
  if (!header) return [];
  const col = (name: RegExp) => header.findIndex((h) => name.test(h));
  const iCompany = col(/^company/i);
  const iTitle = col(/position|role|title/i);
  const iTerm = col(/^term/i);
  const iStatus = col(/status/i);
  if (iCompany < 0 || iTitle < 0 || iTerm < 0 || iStatus < 0) return [];
  return rows.flatMap((row) => {
    const status = trackedStatus(row[iStatus] ?? "");
    if (!status) return [];
    return [{
      company: (row[iCompany] ?? "").trim(),
      title: (row[iTitle] ?? "").trim(),
      term: (row[iTerm] ?? "").trim(),
      status,
    }];
  });
}

export function loadTrackedApplications(directory: string): TrackedApplication[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .filter((file) => file.endsWith(".csv"))
    .flatMap((file) => parseTrackedApplications(readFileSync(path.join(directory, file), "utf8")));
}

const companyKey = (value: string): string => {
  const key = value.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");
  if (/^(anduril|andurilindustries)$/.test(key)) return "anduril";
  if (/^(amex|americanexpress)$/.test(key)) return "amex";
  if (/^(disney|thewaltdisneycompany)$/.test(key)) return "disney";
  if (/^(pinterest|pintrest)$/.test(key)) return "pinterest";
  if (/^(renaissance|renassaince)$/.test(key)) return "renaissance";
  return key.replace(/(incorporated|corporation|company|holdings|technologies|technology|labs|inc|llc|ltd)$/g, "");
};

const titleKey = (value: string): string => value
  .toLowerCase()
  .replace(/\bswe\b/g, "software engineer")
  .replace(/\b(internship|intern|co-?op)\b/g, " ")
  .replace(/\b(winter|spring|summer|fall|jan(?:uary)?)\b/g, " ")
  .replace(/\b20?\d{2}\b/g, " ")
  .replace(/[^a-z0-9+#]+/g, " ")
  .trim()
  .replace(/\s+/g, " ");

const termKeys = (values: readonly string[]): Set<string> => {
  const text = values.join(" ").toLowerCase();
  const years = [...text.matchAll(/\b(20)?(\d{2})\b/g)].map((match) => `20${match[2]}`);
  const year = years[0] ?? "";
  const terms = new Set<string>();
  for (const season of ["winter", "spring", "summer", "fall"] as const) {
    if (new RegExp(`\\b${season}\\b`).test(text)) terms.add(`${season}:${year}`);
  }
  if (/\bjan(?:uary)?\b/.test(text)) terms.add(`winter:${year}`);
  if (/\b(new grad|new graduate|university grad|early career)\b/.test(text)) terms.add("new_grad");
  return terms;
};

/** Matches only the same company, role family, and term so another role stays eligible. */
export function trackedApplicationFor(job: Job, tracked: readonly TrackedApplication[]): TrackedApplication | null {
  const company = companyKey(job.company);
  const title = titleKey(job.title);
  const terms = termKeys([...job.terms, job.title]);
  if (!company || !title || terms.size === 0) return null;
  return tracked.find((application) => {
    if (companyKey(application.company) !== company || titleKey(application.title) !== title) return false;
    const priorTerms = termKeys([application.term]);
    return [...priorTerms].some((term) => terms.has(term));
  }) ?? null;
}

export function parseSheetCsv(text: string): Job[] {
  const [header, ...rows] = parseCsv(text);
  if (!header) return [];
  const col = (name: RegExp) => header.findIndex((h) => name.test(h));
  const iCompany = col(/^company/i);
  const iTitle = col(/role|title/i);
  const iLocation = col(/^location/i);
  const iLink = col(/job link|link|url/i);
  const iStatus = col(/status/i);
  if (iCompany < 0 || iLink < 0) throw new Error("Sheet CSV needs at least Company and Job Link columns");
  const out: Job[] = [];
  for (const r of rows) {
    const link = (r[iLink] ?? "").trim();
    if (!/^https?:\/\//.test(link)) continue;
    const status = (iStatus >= 0 ? r[iStatus] ?? "" : "").toLowerCase();
    if (/^applied|rejected|offer|interview|withdrawn/.test(status)) continue;
    const url = canonicalUrl(link);
    out.push({
      id: jobId(url),
      source: "sheet",
      company: (r[iCompany] ?? "").trim(),
      title: (iTitle >= 0 ? r[iTitle] ?? "" : "").trim(),
      url,
      ats: atsFromUrl(url),
      locations: (iLocation >= 0 ? r[iLocation] ?? "" : "").split(/\s*\/\s*|;/).map((s) => s.trim()).filter(Boolean),
      postedAt: null,
      terms: [],
      sponsorship: "unknown",
      degrees: [],
      category: null,
    });
  }
  return out;
}

export function importSheet(file: string): Job[] {
  return parseSheetCsv(readFileSync(file, "utf8"));
}
