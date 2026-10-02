/**
 * Turns a dumped form into a fill plan with one JEV call per chunk of fields.
 *
 * Text-like fields: a choice over every profile key, bank intent and special
 * key, so the answer is "which value goes here" in one shot.
 * Select, radio and combobox fields: a choice over the field's own options
 * (plus "none") given the candidate's facts, so the answer is the option.
 * Checkboxes: a noul, "should this be checked".
 * File inputs: resume upload, no model needed.
 */
import { FORM } from "../config.js";
import type { JevClient } from "../jev/client.js";
import { choice, noul } from "../jev/questions.js";
import type { Answer, ChoiceAnswer, NoulAnswer, Questions } from "../jev/types.js";
import { ALL_KEYS, isProfileKey, isSpecialKey, profileFacts, valueFor, type FieldKey } from "../profile/fieldKeys.js";
import type { Profile } from "../profile/schema.js";
import { BANK_INTENTS } from "../answers/bank.js";
import { locationTier } from "../jobs/hardFilters.js";
import type { Job } from "../jobs/normalize.js";
import type { DumpedField, FieldsDump, FillPlan, PlannedField } from "./fields.js";

const NONE = "__none__";

export function buildFormState(profile: Profile, job: Job, dump: FieldsDump, fields: DumpedField[]): Record<string, unknown> {
  const tier = locationTier(job.locations);
  const country = tier === "vancouver" || tier === "canada" ? "Canada" : tier === "us" ? "United States" : tier === "remote" ? "remote (treat as the company's country)" : "unknown";
  return {
    page: { url: dump.url, title: dump.title, context: dump.context },
    job: { company: job.company, title: job.title, locations: job.locations, country },
    candidate: {
      facts: profileFacts(profile),
      work_authorization: {
        citizenships: profile.workAuthorization.citizenships,
        authorized_without_sponsorship_in: profile.workAuthorization.authorizedCountries,
        needs_sponsorship_elsewhere: profile.workAuthorization.requiresSponsorshipElsewhere,
        statement: profile.workAuthorization.statement,
        for_this_job: authForCountry(profile, country),
      },
      education: profile.education[0],
      demographics: profile.demographics,
      preferences: profile.preferences,
      gpa_policy: "Only give a GPA if the field is required. The cumulative GPA is " + (profile.education[0]?.gpa?.cumulative ?? "not provided") + " on a 4.0 scale.",
      rules: [
        "Never claim US work authorization.",
        "Never write a cover letter.",
        "Salary expectation is left blank or set to negotiable.",
        "Marketing opt-ins are optional and left unchecked. Consent and acknowledgement boxes required to apply are checked.",
      ],
    },
    fields: fields.map((f) => ({
      id: f.id,
      kind: f.kind,
      label: f.label,
      hint: f.hint,
      placeholder: f.placeholder,
      name: f.name,
      autocomplete: f.autocomplete,
      required: f.required,
      options: f.options.map((o) => o.label).slice(0, FORM.maxOptionsForJev),
    })),
  };
}

export function authForCountry(profile: Profile, country: string): { authorized: "Yes" | "No"; requires_sponsorship: "Yes" | "No" } {
  const ok = profile.workAuthorization.authorizedCountries.some((c) => country.toLowerCase().includes(c.toLowerCase()));
  return { authorized: ok ? "Yes" : "No", requires_sponsorship: ok ? "No" : "Yes" };
}

const TEXT_KINDS = new Set(["text", "email", "tel", "url", "number", "date", "textarea"]);

export function questionsFor(fields: DumpedField[]): Questions {
  const q: Questions = {};
  const keyCriteria: Record<string, string> = { ...ALL_KEYS };
  for (const [intent, desc] of Object.entries(BANK_INTENTS)) keyCriteria[`bank:${intent}`] = desc;
  for (const f of fields) {
    const title = `Field "${f.label || f.placeholder || f.name}"${f.hint ? ` (${f.hint.slice(0, 120)})` : ""}${f.required ? ", required" : ", optional"}`;
    if (TEXT_KINDS.has(f.kind)) {
      q[f.id] = choice(`${title}: which value should fill it?`, keyCriteria);
    } else if (f.kind === "select" || f.kind === "radio" || f.kind === "combobox") {
      const opts = f.options.slice(0, FORM.maxOptionsForJev);
      if (opts.length === 0) {
        q[f.id] = choice(`${title}: a dropdown whose options are not visible yet. Which value should be typed into it?`, keyCriteria);
        continue;
      }
      const criteria: Record<string, string> = {};
      opts.forEach((o, i) => (criteria[`o${i}`] = o.label || o.value));
      criteria[NONE] = f.required ? "No option fits the candidate at all" : "Leave unselected: optional and not applicable";
      q[f.id] = choice(`${title}: which option is correct for the candidate?`, criteria);
    } else if (f.kind === "checkbox") {
      q[f.id] = noul(`${title}: should this checkbox be checked for the candidate?`, {
        true: "A consent, acknowledgement, terms or accuracy box needed to submit, or a true statement about the candidate",
        false: "A marketing or alert opt-in, or a statement that is not true of the candidate",
      });
    }
  }
  return q;
}

export async function mapForm(jev: JevClient, profile: Profile, job: Job, dump: FieldsDump): Promise<FillPlan> {
  const planned: PlannedField[] = [];
  const startCost = jev.usage.costUsd;
  const askable = dump.fields.filter((f) => f.kind !== "file");
  for (let i = 0; i < askable.length; i += FORM.fieldsPerCall) {
    const chunk = askable.slice(i, i + FORM.fieldsPerCall);
    const questions = questionsFor(chunk);
    const answers = Object.keys(questions).length ? await jev.decide(buildFormState(profile, job, dump, chunk), questions, `map-form:${job.company}`) : {};
    for (const f of chunk) planned.push(planField(f, answers[f.id], profile, job));
  }
  for (const f of dump.fields.filter((f) => f.kind === "file")) {
    const text = `${f.label} ${f.name} ${f.hint} ${f.selector}`;
    const isAutofill = /autofill|auto-fill|parse|prefill/i.test(text);
    const isResume = !isAutofill && (/resume|cv|curriculum/i.test(text) || !/cover|letter|transcript|portfolio|photo|other/i.test(text));
    planned.push({
      id: f.id, selector: f.selector, kind: f.kind, label: f.label, required: f.required,
      action: isResume ? "upload" : "skip", key: isResume ? "resume_upload" : "leave_blank",
      value: isResume ? profile.resume.path : null, optionLabel: null, confidence: 1,
      note: isResume ? null : isAutofill ? "autofill helper, skipped so it does not overwrite the plan" : "not a resume upload",
    });
  }
  const ordered = dump.fields.map((f) => planned.find((p) => p.id === f.id) as PlannedField);
  return {
    jobId: job.id,
    url: dump.url,
    fields: ordered,
    fills: ordered.filter((p) => p.action === "fill" && p.value !== null).map((p) => ({ selector: p.selector, kind: p.kind, value: p.value as string })),
    uploads: ordered.filter((p) => p.action === "upload").map((p) => ({ selector: p.selector, path: p.value as string })),
    drafts: ordered.filter((p) => p.action === "draft").map((p) => {
      const f = dump.fields.find((x) => x.id === p.id) as DumpedField;
      return { id: p.id, selector: p.selector, label: p.label, hint: f.hint, maxLength: f.maxLength, intent: p.key };
    }),
    reviews: ordered.filter((p) => p.action === "review").map((p) => {
      const f = dump.fields.find((x) => x.id === p.id) as DumpedField;
      return { id: p.id, selector: p.selector, kind: p.kind, label: p.label, options: f.options.map((o) => o.label), why: p.note ?? "low confidence" };
    }),
    submitSelectors: dump.submitSelectors,
    jevCostUsd: jev.usage.costUsd - startCost,
  };
}

export function planField(f: DumpedField, answer: Answer | undefined, profile: Profile, job: Job): PlannedField {
  const base = { id: f.id, selector: f.selector, kind: f.kind, label: f.label, required: f.required, optionLabel: null as string | null };
  if (!answer) return { ...base, action: "review", key: "unknown", value: null, confidence: 0, note: "no answer" };

  if (f.kind === "checkbox") {
    const p = (answer as NoulAnswer).noul;
    if (p >= 0.7) return { ...base, action: "fill", key: "checked", value: "true", confidence: p, note: null };
    if (p <= 0.3) return { ...base, action: "skip", key: "unchecked", value: null, confidence: 1 - p, note: "left unchecked" };
    return { ...base, action: "review", key: "unknown", value: null, confidence: Math.max(p, 1 - p), note: "unsure whether to check" };
  }

  const a = answer as ChoiceAnswer;
  const hasOptions = (f.kind === "select" || f.kind === "radio" || f.kind === "combobox") && f.options.length > 0;
  if (hasOptions) {
    if (a.choice === NONE) {
      if (f.required) return { ...base, action: "review", key: "unknown", value: null, confidence: a.confidence, note: "required but no option fits" };
      return { ...base, action: "skip", key: "leave_blank", value: null, confidence: a.confidence, note: "optional, left unselected" };
    }
    const idx = parseInt(a.choice.replace(/^o/, ""), 10);
    const opt = f.options[idx];
    if (!opt) return { ...base, action: "review", key: "unknown", value: null, confidence: 0, note: "option index out of range" };
    const action = a.confidence >= FORM.reviewConfidence ? "fill" : "review";
    // Radios and comboboxes are matched by label in fillFields.js: radio value attributes are often missing or all "on".
    const value = f.kind === "select" ? opt.value : opt.label;
    return { ...base, action, key: `option:${a.choice}`, value, optionLabel: opt.label, confidence: a.confidence, note: a.confidence < FORM.autoConfidence ? `confidence ${a.confidence.toFixed(2)}` : null };
  }

  const key = a.choice;
  const note = a.confidence < FORM.autoConfidence ? `confidence ${a.confidence.toFixed(2)}` : null;
  if (a.confidence < FORM.reviewConfidence) return { ...base, action: "review", key, value: null, confidence: a.confidence, note: `low confidence, best guess ${key}` };
  if (key.startsWith("bank:")) return { ...base, action: "draft", key: key.slice(5), value: null, confidence: a.confidence, note };
  if (isSpecialKey(key)) {
    if (key === "free_text") return { ...base, action: "draft", key: "free_text", value: null, confidence: a.confidence, note };
    if (key === "resume_upload") return { ...base, action: "review", key, value: null, confidence: a.confidence, note: "text field mapped to resume; probably a link or name" };
    if (key === "leave_blank") return { ...base, action: f.required ? "review" : "skip", key, value: null, confidence: a.confidence, note: f.required ? "required but mapped to leave blank" : null };
    return { ...base, action: "review", key, value: null, confidence: a.confidence, note: "unknown field" };
  }
  if (isProfileKey(key)) {
    const value = valueForJob(profile, job, key as FieldKey);
    if (value === null) {
      if (key === "gpa") return { ...base, action: f.required ? "fill" : "skip", key, value: f.required ? gpaValue(profile) : null, confidence: a.confidence, note: f.required ? "GPA given only because the field is required" : "GPA not volunteered" };
      return { ...base, action: f.required ? "review" : "skip", key, value: null, confidence: a.confidence, note: f.required ? "required but the profile has no value" : null };
    }
    return { ...base, action: "fill", key, value, confidence: a.confidence, note };
  }
  return { ...base, action: "review", key, value: null, confidence: a.confidence, note: "unrecognized key" };
}

function gpaValue(profile: Profile): string | null {
  const g = profile.education[0]?.gpa;
  return g?.cumulative !== undefined ? g.cumulative.toFixed(2) : null;
}

/** Profile value for a key, with the two job-dependent keys resolved against the posting's country. */
export function valueForJob(profile: Profile, job: Job, key: FieldKey): string | null {
  if (isSpecialKey(key)) return null;
  if (key === "authorized_to_work" || key === "requires_sponsorship") {
    const tier = locationTier(job.locations);
    const country = tier === "vancouver" || tier === "canada" ? "Canada" : tier === "us" ? "United States" : "unknown";
    const auth = authForCountry(profile, country);
    return key === "authorized_to_work" ? auth.authorized : auth.requires_sponsorship;
  }
  return valueFor(profile, key);
}
