// The reports: text for a terminal, markdown for a job summary or a pull request, JSON for other tools and SARIF for code
// scanning. Every text that comes from the input (a file name, a contract, a variable, a type, a namespace) was cleaned
// by safeText before it reached the report object. The markdown format also escapes what markdown gives a meaning to, and
// the SARIF format is built as an object and written by JSON.stringify.

import { SOURCES } from './data.js';
import { RULES } from './rules.js';
import { grouped, plural } from './size.js';

const URI = 'https://github.com/INNERLUXES/storage-layout-check';

const FORMS = { layout: 'a storage layout', artifact: 'an artifact', 'standard-json': 'a compiler output', 'build-info': 'a build info file' };

function findingsLine(r) {
  const b = r.totals.byLevel;
  const parts = ['error', 'warning', 'info'].filter((l) => b[l]).map((l) => `${grouped(b[l])} ${l}`);
  return `${grouped(r.totals.findings)}${parts.length ? ` (${parts.join(', ')})` : ''}${r.totals.hidden ? `; ${grouped(r.totals.hidden)} below ${r.config.minSeverity} not shown` : ''}`;
}

// What was read on one side: its size, its form and what the layout holds.
function sideLine(input, s) {
  const form = input.form ? `${FORMS[input.form]}${input.contract ? ` (contract ${input.contract})` : ''}` : 'no layout';
  const spaces = s.namespaces ? `, ${plural(s.namespaced, 'variable')} in ${plural(s.namespaces, 'namespace')}` : '';
  return `${plural(input.lines, 'line')}, ${plural(input.bytes, 'byte')}, ${form}; ${plural(s.variables, 'variable')} in ${plural(s.contracts, 'contract')}${spaces}`;
}

function table(head, rows, indent = '  ') {
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((row) => row[i].length)));
  const line = (cells) => `${indent}${cells.map((c, i) => (i === cells.length - 1 ? c : c.padEnd(widths[i]))).join('  ')}`.trimEnd();
  return [line(head), ...rows.map(line)];
}

const PAD = ' '.repeat(11);

export function toText(r, { explain = false } = {}) {
  const out = [];
  out.push(`storage-layout-check: ${r.input.old.file} -> ${r.input.new.file}`);
  out.push(`old: ${sideLine(r.input.old, r.summary.old)}`);
  out.push(`new: ${sideLine(r.input.new, r.summary.new)}`);
  out.push(`findings: ${findingsLine(r)}`);
  out.push('', `Checks (${grouped(r.rules.length)})`, '');
  out.push(...table(['check', 'level', 'kind', 'findings'], r.rules.map((x) => [x.id, x.level, x.kind, grouped(x.findings)])), '');
  out.push(`Findings (${grouped(r.findings.length)})`, '');
  if (!r.findings.length) out.push('  none', '');
  const width = Math.max(...RULES.map((x) => x.id.length));
  for (const f of r.findings) {
    out.push(`  ${f.severity.toUpperCase().padEnd(8)} ${f.id.padEnd(width)}  ${f.at}`);
    out.push(`${PAD}${f.message}`);
    out.push(`${PAD}fix: ${f.fix}`);
    if (explain) {
      for (const b of f.basis) out.push(`${PAD}basis: ${b.text} (${b.source}, ${b.url})`);
      if (f.own) out.push(`${PAD}the tool's own choice: ${f.own}`);
    }
    out.push('');
  }
  for (const n of r.notes) out.push(`note: ${n}`);
  if (r.notes.length) out.push('');
  out.push(r.notice, '');
  out.push(`RESULT: ${r.result.text}`);
  return `${out.join('\n')}\n`;
}

// Text for a markdown table cell or line: the characters markdown gives a meaning to are escaped.
const md = (t) => String(t).replace(/[\\`*_{}[\]<>()#+!|~]/g, (c) => `\\${c}`).replace(/\r?\n/g, ' ');

export function toMarkdown(r, { explain = false } = {}) {
  const out = [];
  out.push(`# storage-layout-check: ${md(r.input.old.file)} -> ${md(r.input.new.file)}`, '');
  out.push(`- Old: ${md(sideLine(r.input.old, r.summary.old))}`);
  out.push(`- New: ${md(sideLine(r.input.new, r.summary.new))}`);
  out.push(`- Findings: ${md(findingsLine(r))}`);
  out.push(`- Result: **${md(r.result.text)}**`, '');
  out.push('## Findings', '');
  if (!r.findings.length) out.push('None.', '');
  else {
    out.push('| Level | Check | Where | Message |', '| --- | --- | --- | --- |');
    for (const f of r.findings) out.push(`| ${f.severity} | ${f.id} | ${md(f.at)} | ${md(f.message)} Fix: ${md(f.fix)} |`);
    out.push('');
  }
  if (explain) {
    out.push('## Basis', '');
    const seen = new Set();
    for (const f of r.findings) {
      if (seen.has(f.id)) continue;
      seen.add(f.id);
      out.push(`### ${f.id}`, '');
      for (const b of f.basis) out.push(`- ${md(b.text)} (${md(b.source)}, <${b.url}>)`);
      if (f.own) out.push(`- The tool's own choice: ${md(f.own)}`);
      out.push('');
    }
  }
  for (const n of r.notes) out.push(`Note: ${md(n)}`, '');
  out.push(`${md(r.notice)}`, '');
  return `${out.join('\n')}`;
}

export function toJson(r, { explain = false } = {}) {
  const out = { ...r, findings: r.findings.map((f) => (explain ? f : { ...f, basis: undefined, own: undefined })) };
  return `${JSON.stringify(out, null, 2)}\n`;
}

const SARIF_LEVEL = { error: 'error', warning: 'warning', info: 'note' };

// SARIF 2.1.0: the checks as rules of the driver, both files as artifacts, and one result for each finding with its file,
// line and column.
export function toSarif(r) {
  const sarif = {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'storage-layout-check',
            version: r.version,
            informationUri: URI,
            rules: RULES.map((x) => ({
              id: x.id,
              name: x.id,
              shortDescription: { text: x.summary },
              help: { text: `${x.fix} (${x.kind})` },
              defaultConfiguration: { level: SARIF_LEVEL[x.severity] },
              properties: { kind: x.kind }
            }))
          }
        },
        artifacts: [{ location: { uri: r.input.old.file } }, { location: { uri: r.input.new.file } }],
        results: r.findings.map((f) => ({
          ruleId: f.id,
          ruleIndex: RULES.findIndex((x) => x.id === f.id),
          level: SARIF_LEVEL[f.severity],
          message: { text: `${f.message} Fix: ${f.fix}` },
          locations: [{ physicalLocation: { artifactLocation: { uri: f.file, index: f.side === 'old' ? 0 : 1 }, region: { startLine: f.line, startColumn: f.column } } }],
          properties: { kind: f.kind, side: f.side }
        })),
        properties: { notice: r.notice, result: r.result.text, sources: SOURCES.map((s) => s.url) }
      }
    ]
  };
  return `${JSON.stringify(sarif, null, 2)}\n`;
}

// The list of checks, for --list-checks.
export function listChecksText() {
  const width = Math.max(...RULES.map((x) => x.id.length));
  const out = ['storage-layout-check checks', ''];
  for (const x of RULES) out.push(`  ${x.id.padEnd(width)}  ${x.severity.padEnd(7)}  ${x.kind.padEnd(13)}  ${x.summary}`);
  out.push('', 'A documented check rests on the Solidity or OpenZeppelin documentation or on an ERC; a best practice check is this tool\'s own choice and says so in its message. An input check is about a file itself.', '');
  return out.join('\n');
}

export function listChecksMarkdown() {
  const out = ['# storage-layout-check checks', '', '| Check | Level | Kind | What it looks at |', '| --- | --- | --- | --- |'];
  for (const x of RULES) out.push(`| ${x.id} | ${x.severity} | ${x.kind} | ${md(x.summary)} |`);
  out.push('');
  return out.join('\n');
}

export function listChecksJson() {
  return `${JSON.stringify(RULES.map((x) => ({ id: x.id, severity: x.severity, kind: x.kind, summary: x.summary, fix: x.fix, basis: x.basis, own: x.own ?? null })), null, 2)}\n`;
}
