import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

function resolveCmuxBin(): string {
  // 1. Environment variable override
  if (process.env.CMUX_PATH) {
    return process.env.CMUX_PATH;
  }

  // 2. Try PATH lookup (works when cmux is properly installed)
  try {
    const found = execFileSync('which', ['cmux'], {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    if (found) return found;
  } catch {
    // not in PATH
  }

  // 3. macOS default install locations
  const macPaths = [
    '/Applications/cmux.app/Contents/Resources/bin/cmux',
    `${process.env.HOME}/Applications/cmux.app/Contents/Resources/bin/cmux`,
  ];
  for (const p of macPaths) {
    if (existsSync(p)) return p;
  }

  // 4. Fallback — hope it's in PATH at runtime
  return 'cmux';
}

export const CMUX_BIN = resolveCmuxBin();
