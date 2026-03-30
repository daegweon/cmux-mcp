# cmux-mcp

[한국어](./README.ko.md)

**MCP server that gives AI agents full control of your [cmux](https://github.com/manaflow-ai/cmux) terminal.**

Let Claude run commands, read output, and send control characters in your cmux terminal -- all through the Model Context Protocol. Works in the background. No focus stealing.

## Quick Start

### 1. Clone and build

```bash
git clone https://github.com/daegweon/cmux-mcp.git
cd cmux-mcp
npm install && npm run build
```

### 2. Add to Claude Code

Edit `~/.claude/settings.json`:

```jsonc
{
  "mcpServers": {
    "cmux-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/cmux-mcp/build/index.js"]
    }
  }
}
```

### 3. Restart Claude Code

That's it. Claude can now read and write to your cmux terminal.

<details>
<summary>Claude Desktop setup</summary>

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```jsonc
{
  "mcpServers": {
    "cmux-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/cmux-mcp/build/index.js"]
    }
  }
}
```

Restart Claude Desktop after saving.

</details>

<details>
<summary>Any MCP client</summary>

cmux-mcp communicates over stdio. Point your MCP client to `node /path/to/cmux-mcp/build/index.js`.

</details>

### Requirements

- macOS
- [cmux.app](https://github.com/manaflow-ai/cmux) installed and running
- Node.js 18+

## What Can It Do?

cmux-mcp provides three tools to any MCP client:

### `write_to_terminal`

Send commands to your terminal. Enter is appended automatically. Returns the number of new output lines so the agent knows how much to read back.

```
"Run npm test in my terminal"
```

### `read_terminal_output`

Read the last N lines from the terminal. Only fetches what you ask for -- no wasted tokens on the full scrollback.

```
"Show me the last 20 lines of terminal output"
```

### `send_control_character`

Send Ctrl+C, Ctrl+Z, Escape, or any control character. Interrupt stuck processes, exit REPLs, send telnet escape sequences.

```
"Stop the running process" → sends Ctrl+C
```

### Real-World Examples

**Run tests and analyze failures:**
> "Run the test suite and tell me which tests are failing"

Claude sends `npm test`, reads the output, and summarizes the failures.

**Interactive REPL session:**
> "Open a Python REPL and check if pandas is installed"

Claude starts `python3`, types `import pandas`, reads the result, and reports back.

**Long-running process management:**
> "Start the dev server, wait for it to be ready, then run the health check"

Claude sends the start command, polls the output until "ready" appears, then runs the next command.

## Why cmux-mcp?

### Background operation

cmux-mcp uses cmux's native CLI (`cmux send`, `cmux read-screen`, `cmux send-key`) which communicates via Unix socket. This means:

- Works while cmux is in the background
- No window focus stealing
- No AppleScript activation delays
- Reliable even during app initialization

### CLI vs AppleScript

This project was forked from [ferrislucas/iterm-mcp](https://github.com/ferrislucas/iterm-mcp) and completely rewritten. Here's why:

| | AppleScript (iterm-mcp) | cmux CLI (cmux-mcp) |
|---|---|---|
| **Focus** | May steal focus, activate app | No focus change, Unix socket |
| **Buffer reading** | Ghostty `write_scrollback_file` (debug-only) | `cmux read-screen` (stable production API) |
| **Startup** | Fails if app not fully initialized | Socket-based, more resilient |
| **Targeting** | Always "front window" | `--surface` flag for precise pane targeting |
| **Key support** | ASCII codes only | Named keys: `ctrl+c`, `escape`, `enter`, arrows |
| **Stability** | Fragile to app state changes | Decoupled via socket IPC |

### Smart completion detection

cmux-mcp doesn't just blindly wait after sending a command. It monitors the TTY's CPU activity to know when a command actually finishes -- even for commands that produce output over time.

### Token efficient

Agents read only the lines they need. A `npm test` that produces 500 lines of output? The agent first gets told "500 lines were output", then reads just the last 20 lines to check for errors. No wasted context window.

## Handling Known cmux Issues

cmux-mcp's architecture avoids several known cmux edge cases:

| Issue | Problem | How cmux-mcp handles it |
|-------|---------|------------------------|
| [#152](https://github.com/manaflow-ai/cmux/issues/152) | `read-screen` was debug-only | Uses the now-stable production CLI |
| [#2042](https://github.com/manaflow-ai/cmux/issues/2042) | Invalid surface ID silently falls back to focused pane | Architecture supports `--surface` for explicit targeting |
| [#1715](https://github.com/manaflow-ai/cmux/issues/1715) | TabManager unavailable during startup breaks hooks | Socket-based CLI avoids initialization timing issues |
| [#2153](https://github.com/manaflow-ai/cmux/issues/2153) | `send-key` didn't support arrow keys | Uses the updated upstream API with full key support |
| [#2210](https://github.com/manaflow-ai/cmux/issues/2210) | Sidebar toggle corrupts prompt via SIGWINCH | Reads buffer after settling delay to avoid corrupted output |

## Architecture

```
MCP Client (Claude Code, Claude Desktop, etc.)
    |  stdio
cmux-mcp server
    |  child_process
cmux CLI (send / read-screen / send-key)
    |  Unix socket
cmux.app (Ghostty-based terminal)
    |
macOS PTY
```

**Core modules:**

| Module | Role |
|--------|------|
| `CommandExecutor` | Sends commands via `cmux send`, waits for completion |
| `TtyOutputReader` | Reads terminal buffer via `cmux read-screen` |
| `SendControlCharacter` | Sends control keys via `cmux send-key` |
| `ProcessTracker` | Monitors TTY processes for completion detection |

## Development

```bash
npm run build          # Compile TypeScript
npm run watch          # Auto-rebuild on changes
npm test               # Run unit tests
npm run e2e            # Run E2E tests (requires running cmux)
npm run inspector      # Open MCP Inspector for interactive debugging
```

## Safety

- No built-in command restrictions. Commands run with your shell's permissions.
- Monitor AI activity and interrupt if needed.
- Start with focused tasks until you're familiar with the model's behavior.

## Credits

- Forked from [ferrislucas/iterm-mcp](https://github.com/ferrislucas/iterm-mcp)
- Built for [cmux](https://github.com/manaflow-ai/cmux) by manaflow.ai

## License

MIT
