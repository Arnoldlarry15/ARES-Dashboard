import { execSync } from 'node:child_process';
import fs from 'node:fs';

const SECRET_PATTERNS = [
  { name: 'Google API key', regex: /AIza[0-9A-Za-z_-]{35}/ },
  { name: 'OpenAI/Anthropic key', regex: /sk-(?:proj-|ant-)?[0-9A-Za-z_-]{20,}/ },
  { name: 'GitHub PAT', regex: /ghp_[0-9A-Za-z]{36}|github_pat_[0-9A-Za-z_]{22,}/ },
  { name: 'AWS Access Key', regex: /AKIA[0-9A-Z]{16}/ },
  { name: 'Private Key Block', regex: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/ },
  { name: 'Stripe Live Key', regex: /sk_live_[0-9A-Za-z]{16,}|rk_live_[0-9A-Za-z]{16,}/ },
  { name: 'Database URL with non-placeholder credentials', regex: /postgres(?:ql)?:\/\/(?!postgres:postgres@localhost|postgres:password@|user:password@|USER:PASSWORD@)[^:\s]+:[^@\s]{8,}@(?!localhost|127\.0\.0\.1|postgres)/ }
];

const IGNORE_PREFIXES = ['.git/', 'node_modules/', 'dist/', 'coverage/', 'tests/'];

const trackedFiles = execSync('git ls-files', { encoding: 'utf8' })
  .split(/\r?\n/)
  .map((f) => f.trim())
  .filter(Boolean)
  .filter((f) => !IGNORE_PREFIXES.some((prefix) => f.startsWith(prefix)));

const findings = [];

for (const file of trackedFiles) {
  if (file === '.env' || (file.startsWith('.env.') && !file.endsWith('.example'))) {
    findings.push({ file, line: 1, rule: 'Tracked environment file' });
    continue;
  }
  let content;
  try {
    content = fs.readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  const lines = content.split(/\r?\n/);
  lines.forEach((lineText, idx) => {
    for (const rule of SECRET_PATTERNS) {
      if (rule.regex.test(lineText)) {
        findings.push({ file, line: idx + 1, rule: rule.name });
      }
    }
  });
}

if (findings.length > 0) {
  console.error('Potential secrets detected in tracked files:');
  for (const f of findings) {
    console.error(` - ${f.file}:${f.line} (${f.rule})`);
  }
  process.exit(1);
}

console.log(`Secret scan passed (${trackedFiles.length} tracked files checked).`);
