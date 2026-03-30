# cmux-mcp

MCP server for cmux terminal control. Forked from iterm-mcp, rewritten to use cmux CLI (Unix socket) instead of AppleScript.

## Commands

| Command | Description |
|---------|-------------|
| `npm install` | Install dependencies |
| `npm run build` | Compile TS → `build/` (also chmods index.js to 755) |
| `npm run watch` | Auto-rebuild on file changes |
| `npm test` | Run unit tests (Jest, ESM mode) |
| `npm run e2e` | Run E2E tests (requires running cmux instance) |
| `npm run inspector` | Open MCP Inspector at localhost for interactive debugging |

## Architecture

```
src/
  index.ts                 # MCP server entry point, tool definitions, stdio transport
  CommandExecutor.ts       # Sends commands via `cmux send`, waits for completion via ProcessTracker
  TtyOutputReader.ts       # Reads terminal buffer via `cmux read-screen`
  SendControlCharacter.ts  # Sends control keys via `cmux send-key`
  ProcessTracker.ts        # Monitors TTY processes (ps-based), CPU-based completion detection
test/
  unit/                    # Jest unit tests (mocked cmux CLI)
  e2e/                     # E2E tests (live cmux instance required)
build/                     # Compiled JS output (gitignored)
```

## Key Files

- `src/index.ts` — MCP server setup, 3 tool handlers: `write_to_terminal`, `read_terminal_output`, `send_control_character`
- `src/CommandExecutor.ts` — Core logic: `cmux send` → poll ProcessTracker until CPU idle → return buffer
- `src/ProcessTracker.ts` — Pure Unix process inspection, no cmux dependency. Reused from iterm-mcp unchanged.
- `jest.config.cjs` — CommonJS config required for Jest ESM support (`extensionsToTreatAsEsm`, `ts-jest` with `useESM`)

## Code Style

- ESM modules (`"type": "module"` in package.json)
- All imports use `.js` extension (Node16 module resolution)
- TypeScript strict mode enabled
- No AppleScript anywhere — all terminal interaction via `cmux` CLI binary
- `execPromise` pattern: `promisify(exec)` used throughout, injectable via constructor for testing

## Testing

- `npm test` — Unit tests only, mock `execPromise` to avoid needing cmux
- `npm run e2e` — Needs live cmux instance, tests actual command execution
- Test files match `test/unit/*.test.ts` (configured in jest.config.cjs `testMatch`)
- Coverage excludes `src/index.ts` (entry point with side effects)

## Gotchas

- **`cmux send` needs `\n` for Enter**: Unlike iTerm's `write text`, cmux's `input text` / `cmux send` does not auto-append newline. CommandExecutor appends `\n` explicitly.
- **Shell escaping, not AppleScript escaping**: Commands are wrapped in single quotes for shell (`shellEscape()`), not AppleScript-escaped. Don't add AppleScript escaping back.
- **`cmux read-screen` output may be stale**: After sending a command, there's a 200ms settle delay before reading. Don't reduce this without testing.
- **TTY discovery via `lsof`**: No AppleScript `get tty` equivalent. `retrieveTtyPath()` uses `lsof -c cmux` with `ps` fallback. May return wrong TTY if multiple cmux windows exist.
- **ProcessTracker CPU threshold**: Command considered "done" when total CPU < 1% sustained for 1 second. Long-idle commands (like `sleep`) may appear done immediately.
- **`cmux send-key` doesn't cover all keys**: Telnet escape (`]`, ASCII 29) has no named key — uses raw `cmux send -- $'\x1d'` instead.
- **Build output must be executable**: `npm run build` runs `chmod 755` on `build/index.js` so it works as npx binary.
- **yarn.lock exists but we use npm**: Project was originally yarn-based. Both lock files exist. Use `npm install`.

## Workflow

- After editing any `src/*.ts`, run `npm run build` before testing via MCP Inspector
- To test changes against live terminal: `npm run build && npm run inspector`
- E2E tests will send actual commands to the focused cmux terminal — don't run with unsaved work in that terminal
- Git remote `origin` → `daegweon/cmux-mcp`, `upstream` → `ferrislucas/iterm-mcp`
