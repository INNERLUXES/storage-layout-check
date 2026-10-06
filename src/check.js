// A run: read the two files, find the layout in each, compare them and build the report object that the formats write.

import { compareLayouts } from './compare.js';
import { LEVELS, NOTICE, POINTS, pointPage } from './data.js';
import { FILE_LIMITS, InputError, displayPath, locateLayout, readLayoutText } from './files.js';
import { JsonError, readJson } from './json.js';
import { pickLayout, readLayout } from './layout.js';
import { RULES, decide, ruleById } from './rules.js';
import { safeText } from './text.js';

export const LIMITS = { ...FILE_LIMITS };

export { InputError };

const clean = (t, max = 900) => safeText(t, max);

const ORDER = { error: 0, warning: 1, info: 2 };

// The basis of a rule: the points with their pages.
function basisOf(rule) {
  return rule.basis.map((id) => {
    const page = pointPage(id);
    return { text: POINTS[id].text, source: page.title, url: page.url };
  });
}

// One side of a run, read from its text: { layout, form, contract, findings }. layout is null when the text holds no
// layout the tool can compare, and findings then holds one layout-unreadable finding with its line.
export function readSide(text, { contract = null, side = 'the file' } = {}) {
  let root;
  try {
    root = readJson(text);
  } catch (error) {
    if (!(error instanceof JsonError)) throw error;
    return { layout: null, form: null, contract: null, findings: [{ id: 'layout-unreadable', line: error.line, column: error.column, message: `The file is not JSON the reader can follow: ${error.message}. Nothing in the file was compared.` }] };
  }
  const picked = pickLayout(root, contract, side);
  if (picked.error) return { layout: null, form: null, contract: null, findings: [{ id: 'layout-unreadable', line: picked.line, column: picked.column, message: picked.error }] };
  const layout = readLayout(picked.node);
  if (layout.error) return { layout: null, form: picked.form, contract: picked.name, findings: [{ id: 'layout-unreadable', line: layout.line, column: layout.column, message: layout.error }] };
  return { layout, form: picked.form, contract: picked.name, findings: [] };
}

// The counts of a side for the report.
function summaryOf(side) {
  if (!side.layout) return { variables: 0, contracts: 0, namespaces: 0, namespaced: 0 };
  const [main, ...namespaces] = side.layout.spaces;
  return {
    variables: main.items.length,
    contracts: new Set(main.items.map((i) => i.contractName)).size,
    namespaces: namespaces.length,
    namespaced: namespaces.reduce((n, s) => n + s.items.length, 0)
  };
}

// The findings of two texts, with no file system: { findings (each with its side), old, new, notes }.
export function checkTexts(oldText, newText, { contract = [null, null] } = {}) {
  const oldSide = readSide(oldText, { contract: contract[0], side: 'the old file' });
  const newSide = readSide(newText, { contract: contract[1], side: 'the new file' });
  const findings = [...oldSide.findings.map((f) => ({ ...f, side: 'old' })), ...newSide.findings.map((f) => ({ ...f, side: 'new' }))];
  const notes = [];
  if (oldSide.layout && newSide.layout) {
    const compared = compareLayouts(oldSide.layout, newSide.layout, { names: [oldSide.contract ?? contract[0], newSide.contract ?? contract[1]] });
    findings.push(...compared.findings);
    notes.push(...compared.notes);
  } else notes.push('the layouts were not compared, because a file holds no layout the tool can read');
  for (const [name, side] of [['old', oldSide], ['new', newSide]]) {
    if (side.layout) for (const p of side.layout.problems) findings.push({ id: 'layout-incomplete', side: name, line: p.line, column: p.column, message: p.message });
  }
  return { findings, old: { form: oldSide.form, contract: oldSide.contract, ...summaryOf(oldSide) }, new: { form: newSide.form, contract: newSide.contract, ...summaryOf(newSide) }, notes };
}

const lineCount = (text) => {
  const parts = text === '' ? [] : text.split(/\r\n|\r|\n/);
  return parts.length > 0 && parts.at(-1) === '' ? parts.length - 1 : parts.length;
};

// The report object for the findings of two files.
export function buildReport({ files, checked, version, minSeverity = 'info', failOn = 'error' }) {
  const all = checked.findings.map((f) => {
    const rule = ruleById(f.id);
    const file = files[f.side].file;
    return {
      id: f.id,
      severity: rule.severity,
      message: clean(f.message),
      side: f.side,
      file,
      line: f.line,
      column: f.column,
      at: `${file}:${f.line}`,
      contract: f.contract ?? null,
      variable: f.variable ?? null,
      namespace: f.namespace ?? null,
      fix: rule.fix,
      kind: rule.kind,
      basis: basisOf(rule),
      own: rule.own ?? null
    };
  });
  const sideOrder = { old: 0, new: 1 };
  all.sort((a, b) => ORDER[a.severity] - ORDER[b.severity] || sideOrder[a.side] - sideOrder[b.side] || a.line - b.line || a.column - b.column || a.id.localeCompare(b.id, 'en'));
  const shown = all.filter((f) => LEVELS.indexOf(f.severity) >= LEVELS.indexOf(minSeverity));
  const byLevel = { error: 0, warning: 0, info: 0 };
  for (const f of shown) byLevel[f.severity] += 1;
  const allByLevel = { error: 0, warning: 0, info: 0 };
  for (const f of all) allByLevel[f.severity] += 1;
  return {
    tool: 'storage-layout-check',
    version,
    input: {
      old: { ...files.old, form: checked.old.form, contract: checked.old.contract === null ? null : clean(checked.old.contract, 200) },
      new: { ...files.new, form: checked.new.form, contract: checked.new.contract === null ? null : clean(checked.new.contract, 200) }
    },
    summary: { old: { variables: checked.old.variables, contracts: checked.old.contracts, namespaces: checked.old.namespaces, namespaced: checked.old.namespaced }, new: { variables: checked.new.variables, contracts: checked.new.contracts, namespaces: checked.new.namespaces, namespaced: checked.new.namespaced } },
    totals: { findings: shown.length, byLevel, hidden: all.length - shown.length },
    rules: RULES.map((r) => ({ id: r.id, level: r.severity, kind: r.kind, findings: shown.filter((f) => f.id === r.id).length })),
    config: { minSeverity, failOn },
    findings: shown,
    notes: checked.notes.map((n) => clean(n)),
    notice: NOTICE,
    result: decide(allByLevel, failOn)
  };
}

// Reads one file: its place in the report, its size and its text.
async function readFileOf(path, base, limits) {
  const absolute = await locateLayout(path, base);
  const { text, bytes } = await readLayoutText(absolute, base, limits);
  return { text, file: displayPath(absolute, base), bytes, lines: lineCount(text) };
}

export async function checkFiles({ oldPath, newPath, contract = [null, null], minSeverity = 'info', failOn = 'error', version, limits = LIMITS, base = process.cwd() }) {
  const problems = [];
  const read = async (p) => {
    try {
      return await readFileOf(p, base, limits);
    } catch (error) {
      if (!(error instanceof InputError)) throw error;
      problems.push(...error.problems);
      return null;
    }
  };
  const oldFile = await read(oldPath);
  const newFile = await read(newPath);
  if (problems.length) throw new InputError(problems);
  const checked = checkTexts(oldFile.text, newFile.text, { contract });
  const files = { old: { file: oldFile.file, bytes: oldFile.bytes, lines: oldFile.lines }, new: { file: newFile.file, bytes: newFile.bytes, lines: newFile.lines } };
  return buildReport({ files, checked, version, minSeverity, failOn });
}
