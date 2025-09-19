import { appendFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const reportPath = path.join(repoRoot, 'apps/orchestrator/tests/smoke-report.json');
const testFile = path.join(repoRoot, 'apps/orchestrator/tests/smoke.spec.ts');

let results = [];
try {
  results = JSON.parse(readFileSync(reportPath, 'utf8'));
} catch (error) {
  console.log('::warning::Smoke report not found, skipping summary');
  process.exit(0);
}

const lines = readFileSync(testFile, 'utf8').split('\n');
const lineLookup = new Map();
for (let i = 0; i < lines.length; i += 1) {
  const match = lines[i].match(/record\('([^']+)'/);
  if (match) {
    lineLookup.set(match[1], i + 1);
  }
}

const summaryLines = [
  '### Stack A Smoke Summary',
  '',
  '| Component | Status | Duration (s) | Detail |',
  '| --- | --- | --- | --- |',
];

const failing = [];
for (const result of results) {
  const statusIcon = result.status === 'pass' ? '✅' : '❌';
  const durationSeconds = (result.duration_ms / 1000).toFixed(2);
  summaryLines.push(`| ${result.component} | ${statusIcon} | ${durationSeconds} | ${result.detail.replace(/\n/g, ' ')} |`);
  if (result.status !== 'pass') {
    failing.push(result);
    console.log(`::error::${result.component} failed — ${result.detail}`);
  }
}

const summary = `${summaryLines.join('\n')}\n`;
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
}

if (failing.length === 0) {
  console.log('::notice::Stack A smoke suite passed on this matrix lane');
}

const annotations = failing.slice(0, 50).map((failure) => ({
  path: path.relative(repoRoot, testFile),
  start_line: lineLookup.get(failure.component) ?? 1,
  end_line: lineLookup.get(failure.component) ?? 1,
  annotation_level: 'failure',
  message: `${failure.component} — ${failure.detail}`,
}));

const payload = {
  name: 'Stack A smoke',
  head_sha: process.env.GITHUB_SHA,
  status: 'completed',
  conclusion: failing.length ? 'failure' : 'success',
  output: {
    title: 'Stack A smoke diagnostics',
    summary,
    annotations,
  },
};

const token = process.env.GITHUB_TOKEN;
const repository = process.env.GITHUB_REPOSITORY;
if (!token || !repository) {
  if (failing.length) {
    console.log('::warning::Missing GITHUB_TOKEN or repository, unable to create check-run');
  }
  process.exit(0);
}

const response = await fetch(`https://api.github.com/repos/${repository}/check-runs`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(payload),
});

if (!response.ok) {
  const body = await response.text();
  console.log(`::warning::Failed to publish check-run (${response.status}): ${body}`);
}
