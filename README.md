# cmux-mcp

[한국어 문서 (Korean)](./README.ko.md)

MCP server that gives AI agents full control of your cmux terminal. Built on proven technology from iterm-mcp but completely rewritten for cmux's native CLI.

## Overview

cmux-mcp is a Model Context Protocol server that enables AI agents (Claude, etc.) to interact with your cmux terminal as if you were typing. Unlike AppleScript-based approaches, this implementation uses cmux's stable CLI commands—`cmux send`, `cmux read-screen`, and `cmux send-key`—which connect via Unix socket and work reliably even when cmux is backgrounded.

- **Repository**: https://github.com/daegweon/cmux-mcp
- **Forked from**: [ferrislucas/iterm-mcp](https://github.com/ferrislucas/iterm-mcp)
- **Built for**: [cmux](https://github.com/manaflow-ai/cmux)

## Features

- **Background Operation** — Works while cmux is in the background. No window focus stealing, no focus conflicts.
- **Token Efficient** — Read only the lines you need. Agents inspect exactly the output they care about, not the entire buffer.
- **Full Terminal Control** — Send commands, read output, send Ctrl+C, Ctrl+Z, Escape, and custom escape sequences.
- **REPL Support** — Interact with Node, Python, Ruby, bash, and other REPLs. Perfect for iterative exploration.
- **Smart Completion Detection** — Monitors CPU activity to know when a command finishes, not just when output stops.
- **Minimal Dependencies** — Built on `@modelcontextprotocol/sdk` only. No complex build chains or system dependencies.
- **Broad Compatibility** — Works with Claude Desktop, Claude Code, and any MCP client.

## Why CLI Over AppleScript?

| Feature | AppleScript Approach | cmux CLI Approach |
|---------|---------------------|-------------------|
| Background operation | May focus app, steal keyboard | Works via Unix socket, no focus needed |
| Terminal reading | Requires Ghostty's debug-only `write_scrollback_file` action | `cmux read-screen` is stable production CLI |
| Reliability | AppleScript can fail during app initialization | CLI connects via socket, more resilient |
| Surface targeting | Always targets front window | `--surface` flag supports precise targeting |
| Key support | Limited to ASCII character codes | Named keys: `ctrl+c`, `escape`, arrows, `enter` |

## Resolved cmux Issues

cmux-mcp works around and handles several known cmux limitations:

- **manaflow-ai/cmux#152** — `read-screen` was debug-only; now exposed in production. cmux-mcp uses this stable API instead of unreliable Ghostty actions.
- **manaflow-ai/cmux#2042** — `send` silently fell back to focused pane for invalid surface IDs. Architecture supports `--surface` flag to avoid this.
- **manaflow-ai/cmux#1715** — TabManager unavailable during app startup caused hook errors. Socket-based CLI is more resilient to timing issues.
- **manaflow-ai/cmux#2153** — `send-key` lacked arrow key support. Now fixed upstream; cmux-mcp's `send_control_character` uses the updated API.
- **manaflow-ai/cmux#2210** — Sidebar toggle caused SIGWINCH prompt corruption. cmux-mcp reads terminal buffer after settling delay to avoid corrupted reads.

## Tools

### write_to_terminal

Sends text or commands to the active cmux terminal. Automatically appends `Enter` to simulate pressing the key.

```json
{
  "name": "write_to_terminal",
  "description": "Writes text to the active cmux terminal - often used to run a command in the terminal",
  "input": {
    "command": "npm test"
  }
}
```

**Returns**: Number of new output lines produced, so the agent knows exactly how much to read back.

### read_terminal_output

Reads the last N lines from the active cmux terminal. Uses `cmux read-screen --lines N` for recent output or `--scrollback` for full history.

```json
{
  "name": "read_terminal_output",
  "description": "Reads the output from the active cmux terminal",
  "input": {
    "linesOfOutput": 50
  }
}
```

**Returns**: Plain text of terminal output.

### send_control_character

Sends control characters and special keys: Ctrl+C, Ctrl+Z, Escape, telnet escape (]). Uses `cmux send-key` for named keys and `cmux send` for raw escape sequences.

```json
{
  "name": "send_control_character",
  "description": "Sends a control character to the active cmux terminal (e.g., Control-C, or special sequences like ']' for telnet escape)",
  "input": {
    "letter": "C"
  }
}
```

**Returns**: Confirmation of the control character sent.

## Requirements

- **cmux.app** must be installed and running
- **Node.js** 18 or later
- **macOS**

## Installation

### Claude Code

Add to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "cmux-mcp": {
      "command": "node",
      "args": ["/path/to/cmux-mcp/build/index.js"]
    }
  }
}
```

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "cmux-mcp": {
      "command": "node",
      "args": ["/path/to/cmux-mcp/build/index.js"]
    }
  }
}
```

### Using npx (Quick Test)

```bash
npx -y cmux-mcp
```

## Development

### Clone and Install

```bash
git clone https://github.com/daegweon/cmux-mcp.git
cd cmux-mcp
npm install
```

### Build

```bash
npm run build
```

### Watch Mode

```bash
npm run watch
```

### Test

```bash
npm test
```

Run E2E tests against a live cmux instance:

```bash
npm run e2e
```

### Inspect and Debug

Use the MCP Inspector to test tools interactively:

```bash
npm run inspector
```

This opens a browser-based debugging interface at `http://localhost:3000`.

## Safety Considerations

- The user is responsible for safe usage. No command restrictions are built in.
- Monitor AI activity and interrupt if the model behaves unexpectedly.
- Start with small, focused tasks until you're confident in the model's behavior.
- Commands run with your shell's permissions. Destructive commands can cause real damage.

## License

MIT

## Credits

- Forked from [ferrislucas/iterm-mcp](https://github.com/ferrislucas/iterm-mcp) and completely rewritten for cmux
- Built for [cmux](https://github.com/manaflow-ai/cmux) by manaflow.ai
- Model Context Protocol by Anthropic
