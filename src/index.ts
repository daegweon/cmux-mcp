#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import CommandExecutor from "./CommandExecutor.js";
import TtyOutputReader from "./TtyOutputReader.js";
import SendControlCharacter from "./SendControlCharacter.js";

const execPromise = promisify(exec);

async function runCmux(cmd: string): Promise<string> {
  const { stdout } = await execPromise(`cmux ${cmd}`);
  return stdout.trimEnd();
}

function shellEscape(str: string): string {
  return "'" + str.replace(/'/g, "'\\''") + "'";
}

type ToolArgs = Record<string, unknown>;

const server = new Server(
  { name: "cmux-mcp", version: "1.3.0" },
  { capabilities: { tools: {} } }
);

// ─── Tool Definitions ───
const tools = [
  // === Terminal I/O ===
  {
    name: "write_to_terminal",
    description: "Writes text to the active cmux terminal - often used to run a command in the terminal",
    inputSchema: {
      type: "object" as const,
      properties: {
        command: { type: "string", description: "The command to run or text to write to the terminal" },
        surface: { type: "string", description: "Optional surface ref (e.g. 'surface:1') to target a specific tab. If omitted, targets the active surface." },
      },
      required: ["command"]
    }
  },
  {
    name: "read_terminal_output",
    description: "Reads the output from the active cmux terminal",
    inputSchema: {
      type: "object" as const,
      properties: {
        linesOfOutput: { type: "integer", description: "The number of lines of output to read." },
        surface: { type: "string", description: "Optional surface ref (e.g. 'surface:1') to read from a specific tab. If omitted, reads from the active surface." },
      },
      required: ["linesOfOutput"]
    }
  },
  {
    name: "send_control_character",
    description: "Sends a control character to the active cmux terminal (e.g., Control-C, or special sequences like ']' for telnet escape)",
    inputSchema: {
      type: "object" as const,
      properties: {
        letter: { type: "string", description: "The letter corresponding to the control character (e.g., 'C' for Control-C, ']' for telnet escape)" },
        surface: { type: "string", description: "Optional surface ref to target a specific tab." },
      },
      required: ["letter"]
    }
  },

  // === Surface (Tab) Management ===
  {
    name: "list_surfaces",
    description: "Lists all surfaces (tabs) in the current workspace with their IDs and titles",
    inputSchema: { type: "object" as const, properties: { workspace: { type: "string", description: "Optional workspace ref." }, pane: { type: "string", description: "Optional pane ref." } } }
  },
  {
    name: "new_surface",
    description: "Creates a new terminal tab in the current pane",
    inputSchema: { type: "object" as const, properties: { workspace: { type: "string", description: "Optional workspace ref." }, pane: { type: "string", description: "Optional pane ref." } } }
  },
  {
    name: "close_surface",
    description: "Closes a specific surface (tab)",
    inputSchema: { type: "object" as const, properties: { surface: { type: "string", description: "Surface ref to close. Required." }, workspace: { type: "string", description: "Optional workspace ref." } }, required: ["surface"] }
  },
  {
    name: "focus_surface",
    description: "Focuses (activates) a specific surface (tab)",
    inputSchema: { type: "object" as const, properties: { surface: { type: "string", description: "Surface ref to focus. Required." }, workspace: { type: "string", description: "Optional workspace ref." } }, required: ["surface"] }
  },
  {
    name: "move_surface",
    description: "Moves a surface to a different pane, window, or position",
    inputSchema: { type: "object" as const, properties: { surface: { type: "string", description: "Surface ref to move. Required." }, pane: { type: "string", description: "Target pane ref." }, workspace: { type: "string", description: "Target workspace ref." }, window: { type: "string", description: "Target window ref." }, before: { type: "string", description: "Place before this surface ref." }, after: { type: "string", description: "Place after this surface ref." }, index: { type: "integer", description: "Target index position." }, focus: { type: "boolean", description: "Focus after move. Default true." } }, required: ["surface"] }
  },
  {
    name: "reorder_surface",
    description: "Reorders a surface within its pane",
    inputSchema: { type: "object" as const, properties: { surface: { type: "string", description: "Surface ref. Required." }, index: { type: "integer", description: "Target index." }, before: { type: "string", description: "Place before this ref." }, after: { type: "string", description: "Place after this ref." } }, required: ["surface"] }
  },
  {
    name: "rename_tab",
    description: "Renames a tab (surface)",
    inputSchema: { type: "object" as const, properties: { title: { type: "string", description: "New title. Required." }, surface: { type: "string", description: "Optional surface ref." }, workspace: { type: "string", description: "Optional workspace ref." } }, required: ["title"] }
  },
  {
    name: "new_split",
    description: "Splits the current surface into a new pane",
    inputSchema: { type: "object" as const, properties: { direction: { type: "string", enum: ["left", "right", "up", "down"], description: "Split direction. Required." }, workspace: { type: "string", description: "Optional workspace ref." }, surface: { type: "string", description: "Optional surface ref." }, panel: { type: "string", description: "Optional panel ref." } }, required: ["direction"] }
  },
  {
    name: "drag_surface_to_split",
    description: "Drags a surface to create a split in a direction",
    inputSchema: { type: "object" as const, properties: { surface: { type: "string", description: "Surface ref. Required." }, direction: { type: "string", enum: ["left", "right", "up", "down"], description: "Direction. Required." } }, required: ["surface", "direction"] }
  },
  {
    name: "refresh_surfaces",
    description: "Refreshes all surfaces",
    inputSchema: { type: "object" as const, properties: {} }
  },
  {
    name: "surface_health",
    description: "Checks health of surfaces in a workspace",
    inputSchema: { type: "object" as const, properties: { workspace: { type: "string", description: "Optional workspace ref." } } }
  },

  // === Pane Management ===
  {
    name: "list_panes",
    description: "Lists all panes in the current workspace",
    inputSchema: { type: "object" as const, properties: { workspace: { type: "string", description: "Optional workspace ref." } } }
  },
  {
    name: "new_pane",
    description: "Creates a new pane (split) in the workspace",
    inputSchema: { type: "object" as const, properties: { direction: { type: "string", enum: ["left", "right", "up", "down"], description: "Split direction. Defaults to right." }, workspace: { type: "string", description: "Optional workspace ref." } } }
  },
  {
    name: "focus_pane",
    description: "Focuses a specific pane",
    inputSchema: { type: "object" as const, properties: { pane: { type: "string", description: "Pane ref. Required." }, workspace: { type: "string", description: "Optional workspace ref." } }, required: ["pane"] }
  },
  {
    name: "resize_pane",
    description: "Resizes a pane in a given direction",
    inputSchema: { type: "object" as const, properties: { pane: { type: "string", description: "Pane ref. Required." }, direction: { type: "string", enum: ["L", "R", "U", "D"], description: "Resize direction (L=left, R=right, U=up, D=down). Required." }, amount: { type: "integer", description: "Amount to resize. Default 1." }, workspace: { type: "string", description: "Optional workspace ref." } }, required: ["pane", "direction"] }
  },
  {
    name: "swap_pane",
    description: "Swaps two panes",
    inputSchema: { type: "object" as const, properties: { pane: { type: "string", description: "Source pane ref. Required." }, target_pane: { type: "string", description: "Target pane ref. Required." }, workspace: { type: "string", description: "Optional workspace ref." } }, required: ["pane", "target_pane"] }
  },
  {
    name: "break_pane",
    description: "Breaks a pane out into a new workspace",
    inputSchema: { type: "object" as const, properties: { pane: { type: "string", description: "Optional pane ref." }, workspace: { type: "string", description: "Optional workspace ref." }, surface: { type: "string", description: "Optional surface ref." } } }
  },
  {
    name: "join_pane",
    description: "Joins a pane into another pane",
    inputSchema: { type: "object" as const, properties: { target_pane: { type: "string", description: "Target pane to join into. Required." }, pane: { type: "string", description: "Optional source pane ref." }, workspace: { type: "string", description: "Optional workspace ref." }, surface: { type: "string", description: "Optional surface ref." } }, required: ["target_pane"] }
  },
  {
    name: "last_pane",
    description: "Switches to the last active pane",
    inputSchema: { type: "object" as const, properties: { workspace: { type: "string", description: "Optional workspace ref." } } }
  },
  {
    name: "list_panels",
    description: "Lists all panels in a workspace",
    inputSchema: { type: "object" as const, properties: { workspace: { type: "string", description: "Optional workspace ref." } } }
  },
  {
    name: "focus_panel",
    description: "Focuses a specific panel",
    inputSchema: { type: "object" as const, properties: { panel: { type: "string", description: "Panel ref. Required." }, workspace: { type: "string", description: "Optional workspace ref." } }, required: ["panel"] }
  },

  // === Window Management ===
  { name: "list_windows", description: "Lists all cmux windows", inputSchema: { type: "object" as const, properties: {} } },
  { name: "new_window", description: "Creates a new cmux window", inputSchema: { type: "object" as const, properties: {} } },
  { name: "close_window", description: "Closes a specific cmux window", inputSchema: { type: "object" as const, properties: { window: { type: "string", description: "Window ID. Required." } }, required: ["window"] } },
  { name: "focus_window", description: "Focuses a specific cmux window", inputSchema: { type: "object" as const, properties: { window: { type: "string", description: "Window ID. Required." } }, required: ["window"] } },
  { name: "current_window", description: "Shows the current window info", inputSchema: { type: "object" as const, properties: {} } },
  {
    name: "rename_window",
    description: "Renames the current window",
    inputSchema: { type: "object" as const, properties: { title: { type: "string", description: "New title. Required." }, workspace: { type: "string", description: "Optional workspace ref." } }, required: ["title"] }
  },
  { name: "next_window", description: "Switches to the next window", inputSchema: { type: "object" as const, properties: {} } },
  { name: "previous_window", description: "Switches to the previous window", inputSchema: { type: "object" as const, properties: {} } },
  { name: "last_window", description: "Switches to the last active window", inputSchema: { type: "object" as const, properties: {} } },
  {
    name: "move_workspace_to_window",
    description: "Moves a workspace to a different window",
    inputSchema: { type: "object" as const, properties: { workspace: { type: "string", description: "Workspace ref. Required." }, window: { type: "string", description: "Target window ref. Required." } }, required: ["workspace", "window"] }
  },

  // === Workspace Management ===
  { name: "list_workspaces", description: "Lists all workspaces in the current window", inputSchema: { type: "object" as const, properties: {} } },
  {
    name: "new_workspace",
    description: "Creates a new workspace (shown in the left sidebar)",
    inputSchema: { type: "object" as const, properties: { cwd: { type: "string", description: "Optional working directory." }, command: { type: "string", description: "Optional command to run." } } }
  },
  { name: "close_workspace", description: "Closes a specific workspace", inputSchema: { type: "object" as const, properties: { workspace: { type: "string", description: "Workspace ref. Required." } }, required: ["workspace"] } },
  { name: "select_workspace", description: "Selects (switches to) a specific workspace", inputSchema: { type: "object" as const, properties: { workspace: { type: "string", description: "Workspace ref. Required." } }, required: ["workspace"] } },
  {
    name: "rename_workspace",
    description: "Renames a workspace",
    inputSchema: { type: "object" as const, properties: { title: { type: "string", description: "New title. Required." }, workspace: { type: "string", description: "Optional workspace ref." } }, required: ["title"] }
  },
  { name: "current_workspace", description: "Shows the current workspace info", inputSchema: { type: "object" as const, properties: {} } },
  {
    name: "reorder_workspace",
    description: "Reorders a workspace within the sidebar",
    inputSchema: { type: "object" as const, properties: { workspace: { type: "string", description: "Workspace ref. Required." }, index: { type: "integer", description: "Target index." }, before: { type: "string", description: "Place before this ref." }, after: { type: "string", description: "Place after this ref." } }, required: ["workspace"] }
  },

  // === Search ===
  {
    name: "find_window",
    description: "Searches for a window by content or title",
    inputSchema: { type: "object" as const, properties: { query: { type: "string", description: "Search query. Required." }, content: { type: "boolean", description: "Search in terminal content." }, select: { type: "boolean", description: "Select the found window." } }, required: ["query"] }
  },

  // === Structure ===
  {
    name: "tree",
    description: "Shows the full tree structure of windows/workspaces/panes/surfaces",
    inputSchema: { type: "object" as const, properties: { all: { type: "boolean", description: "Show all windows." }, workspace: { type: "string", description: "Optional workspace ref." } } }
  },
  {
    name: "identify",
    description: "Shows identity info for the current surface/workspace",
    inputSchema: { type: "object" as const, properties: { workspace: { type: "string", description: "Optional workspace ref." }, surface: { type: "string", description: "Optional surface ref." } } }
  },

  // === Notifications ===
  {
    name: "notify",
    description: "Sends a notification",
    inputSchema: { type: "object" as const, properties: { title: { type: "string", description: "Notification title. Required." }, subtitle: { type: "string", description: "Optional subtitle." }, body: { type: "string", description: "Optional body text." }, workspace: { type: "string", description: "Optional workspace ref." }, surface: { type: "string", description: "Optional surface ref." } }, required: ["title"] }
  },
  { name: "list_notifications", description: "Lists all notifications", inputSchema: { type: "object" as const, properties: {} } },
  { name: "clear_notifications", description: "Clears all notifications", inputSchema: { type: "object" as const, properties: {} } },

  // === Sidebar Metadata ===
  {
    name: "set_status",
    description: "Sets a status entry in the sidebar",
    inputSchema: { type: "object" as const, properties: { key: { type: "string", description: "Status key. Required." }, value: { type: "string", description: "Status value. Required." }, icon: { type: "string", description: "Optional icon name." }, color: { type: "string", description: "Optional hex color." }, workspace: { type: "string", description: "Optional workspace ref." } }, required: ["key", "value"] }
  },
  { name: "clear_status", description: "Clears a status entry", inputSchema: { type: "object" as const, properties: { key: { type: "string", description: "Status key. Required." }, workspace: { type: "string", description: "Optional workspace ref." } }, required: ["key"] } },
  { name: "list_status", description: "Lists all status entries", inputSchema: { type: "object" as const, properties: { workspace: { type: "string", description: "Optional workspace ref." } } } },
  {
    name: "set_progress",
    description: "Sets a progress bar in the sidebar (0.0 to 1.0)",
    inputSchema: { type: "object" as const, properties: { value: { type: "number", description: "Progress value 0.0-1.0. Required." }, label: { type: "string", description: "Optional label." }, workspace: { type: "string", description: "Optional workspace ref." } }, required: ["value"] }
  },
  { name: "clear_progress", description: "Clears the progress bar", inputSchema: { type: "object" as const, properties: { workspace: { type: "string", description: "Optional workspace ref." } } } },
  { name: "sidebar_state", description: "Shows the current sidebar state", inputSchema: { type: "object" as const, properties: { workspace: { type: "string", description: "Optional workspace ref." } } } },

  // === Log ===
  {
    name: "log",
    description: "Writes a log entry to the workspace sidebar",
    inputSchema: { type: "object" as const, properties: { message: { type: "string", description: "Log message. Required." }, level: { type: "string", description: "Log level (info, warn, error)." }, source: { type: "string", description: "Optional source name." }, workspace: { type: "string", description: "Optional workspace ref." } }, required: ["message"] }
  },
  { name: "clear_log", description: "Clears log entries", inputSchema: { type: "object" as const, properties: { workspace: { type: "string", description: "Optional workspace ref." } } } },
  { name: "list_log", description: "Lists log entries", inputSchema: { type: "object" as const, properties: { limit: { type: "integer", description: "Max entries to show." }, workspace: { type: "string", description: "Optional workspace ref." } } } },

  // === Buffer ===
  { name: "set_buffer", description: "Sets a named buffer with text content", inputSchema: { type: "object" as const, properties: { text: { type: "string", description: "Buffer content. Required." }, name: { type: "string", description: "Optional buffer name." } }, required: ["text"] } },
  { name: "list_buffers", description: "Lists all buffers", inputSchema: { type: "object" as const, properties: {} } },
  { name: "paste_buffer", description: "Pastes a buffer into the terminal", inputSchema: { type: "object" as const, properties: { name: { type: "string", description: "Optional buffer name." }, workspace: { type: "string", description: "Optional workspace ref." }, surface: { type: "string", description: "Optional surface ref." } } } },

  // === Terminal Control ===
  { name: "clear_history", description: "Clears terminal scrollback history", inputSchema: { type: "object" as const, properties: { workspace: { type: "string", description: "Optional workspace ref." }, surface: { type: "string", description: "Optional surface ref." } } } },
  { name: "respawn_pane", description: "Respawns a pane (restarts the shell)", inputSchema: { type: "object" as const, properties: { workspace: { type: "string", description: "Optional workspace ref." }, surface: { type: "string", description: "Optional surface ref." }, command: { type: "string", description: "Optional command to run." } } } },
  { name: "display_message", description: "Displays a message overlay", inputSchema: { type: "object" as const, properties: { text: { type: "string", description: "Message text. Required." }, print: { type: "boolean", description: "Print to stdout instead." } }, required: ["text"] } },
  { name: "trigger_flash", description: "Triggers a visual flash on the terminal", inputSchema: { type: "object" as const, properties: { workspace: { type: "string", description: "Optional workspace ref." }, surface: { type: "string", description: "Optional surface ref." } } } },
  { name: "pipe_pane", description: "Pipes pane output to a shell command", inputSchema: { type: "object" as const, properties: { command: { type: "string", description: "Shell command. Required." }, workspace: { type: "string", description: "Optional workspace ref." }, surface: { type: "string", description: "Optional surface ref." } }, required: ["command"] } },
  { name: "capture_pane", description: "Captures pane content (tmux-compatible)", inputSchema: { type: "object" as const, properties: { workspace: { type: "string", description: "Optional workspace ref." }, surface: { type: "string", description: "Optional surface ref." }, scrollback: { type: "boolean", description: "Include scrollback." }, lines: { type: "integer", description: "Number of lines." } } } },

  // === Hooks & Misc ===
  { name: "set_hook", description: "Sets or lists event hooks", inputSchema: { type: "object" as const, properties: { event: { type: "string", description: "Event name (for set/unset)." }, command: { type: "string", description: "Command to run on event." }, list: { type: "boolean", description: "List all hooks." }, unset: { type: "string", description: "Unset a hook by event name." } } } },
  { name: "wait_for", description: "Waits for a named signal", inputSchema: { type: "object" as const, properties: { name: { type: "string", description: "Signal name. Required." }, signal: { type: "boolean", description: "Send the signal instead of waiting." }, timeout: { type: "integer", description: "Timeout in seconds." } }, required: ["name"] } },
  { name: "set_app_focus", description: "Sets the app focus state", inputSchema: { type: "object" as const, properties: { state: { type: "string", enum: ["active", "inactive", "clear"], description: "Focus state. Required." } }, required: ["state"] } },
  { name: "markdown_open", description: "Opens a markdown file in a formatted viewer panel with live reload", inputSchema: { type: "object" as const, properties: { path: { type: "string", description: "Path to markdown file. Required." } }, required: ["path"] } },
  { name: "version", description: "Shows cmux version", inputSchema: { type: "object" as const, properties: {} } },
  { name: "ping", description: "Pings the cmux socket", inputSchema: { type: "object" as const, properties: {} } },

  // === Browser ===
  {
    name: "browser",
    description: "Controls the cmux built-in browser. Subcommands: open, open-split, navigate/goto, back, forward, reload, url, snapshot, eval, wait, click, dblclick, hover, focus, check, uncheck, scroll-into-view, type, fill, press, keydown, keyup, select, scroll, screenshot, get, is, find, frame, dialog, download, cookies, storage, tab, console, errors, highlight, state, addinitscript, addscript, addstyle, identify",
    inputSchema: {
      type: "object" as const,
      properties: {
        subcommand: { type: "string", description: "Browser subcommand (e.g. 'open', 'navigate', 'snapshot', 'click'). Required." },
        args: { type: "string", description: "Arguments for the subcommand (e.g. URL, CSS selector, script). Pass as a single string." },
        surface: { type: "string", description: "Optional surface ref for browser surface." },
      },
      required: ["subcommand"]
    }
  },
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

// ─── Tool Handlers ───
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const args: ToolArgs = request.params.arguments || {};
  const name = request.params.name;

  switch (name) {
    // === Terminal I/O ===
    case "write_to_terminal": {
      const surface = args.surface ? String(args.surface) : undefined;
      const executor = new CommandExecutor(undefined, surface);
      const command = String(args.command);
      const beforeBuffer = await TtyOutputReader.retrieveBuffer(surface);
      const beforeLines = beforeBuffer.split("\n").length;
      await executor.executeCommand(command);
      const afterBuffer = await TtyOutputReader.retrieveBuffer(surface);
      const afterLines = afterBuffer.split("\n").length;
      const outputLines = afterLines - beforeLines;
      return { content: [{ type: "text" as const, text: `${outputLines} lines were output after sending the command to the terminal. Read the last ${outputLines} lines of terminal contents to orient yourself. Never assume that the command was executed or that it was successful.` }] };
    }
    case "read_terminal_output": {
      const linesOfOutput = Number(args.linesOfOutput) || 25;
      const surface = args.surface ? String(args.surface) : undefined;
      const output = await TtyOutputReader.call(linesOfOutput, surface);
      return { content: [{ type: "text" as const, text: output }] };
    }
    case "send_control_character": {
      const surface = args.surface ? String(args.surface) : undefined;
      const ctrl = new SendControlCharacter(surface);
      const letter = String(args.letter);
      await ctrl.send(letter);
      return { content: [{ type: "text" as const, text: `Sent control character: Control-${letter.toUpperCase()}` }] };
    }

    // === Surface ===
    case "list_surfaces": {
      let cmd = 'list-pane-surfaces';
      if (args.workspace) cmd += ` --workspace ${args.workspace}`;
      if (args.pane) cmd += ` --pane ${args.pane}`;
      return { content: [{ type: "text" as const, text: await runCmux(cmd) }] };
    }
    case "new_surface": {
      let cmd = 'new-surface --type terminal';
      if (args.workspace) cmd += ` --workspace ${args.workspace}`;
      if (args.pane) cmd += ` --pane ${args.pane}`;
      return { content: [{ type: "text" as const, text: `New surface created. ${await runCmux(cmd)}` }] };
    }
    case "close_surface": {
      let cmd = `close-surface --surface ${args.surface}`;
      if (args.workspace) cmd += ` --workspace ${args.workspace}`;
      return { content: [{ type: "text" as const, text: `Surface ${args.surface} closed. ${await runCmux(cmd)}` }] };
    }
    case "focus_surface": {
      let cmd = `move-surface --surface ${args.surface} --focus true`;
      if (args.workspace) cmd += ` --workspace ${args.workspace}`;
      return { content: [{ type: "text" as const, text: `Focused surface ${args.surface}. ${await runCmux(cmd)}` }] };
    }
    case "move_surface": {
      let cmd = `move-surface --surface ${args.surface}`;
      if (args.pane) cmd += ` --pane ${args.pane}`;
      if (args.workspace) cmd += ` --workspace ${args.workspace}`;
      if (args.window) cmd += ` --window ${args.window}`;
      if (args.before) cmd += ` --before ${args.before}`;
      if (args.after) cmd += ` --after ${args.after}`;
      if (args.index !== undefined) cmd += ` --index ${args.index}`;
      if (args.focus !== undefined) cmd += ` --focus ${args.focus}`;
      return { content: [{ type: "text" as const, text: await runCmux(cmd) }] };
    }
    case "reorder_surface": {
      let cmd = `reorder-surface --surface ${args.surface}`;
      if (args.index !== undefined) cmd += ` --index ${args.index}`;
      if (args.before) cmd += ` --before ${args.before}`;
      if (args.after) cmd += ` --after ${args.after}`;
      return { content: [{ type: "text" as const, text: await runCmux(cmd) }] };
    }
    case "rename_tab": {
      let cmd = 'rename-tab';
      if (args.workspace) cmd += ` --workspace ${args.workspace}`;
      if (args.surface) cmd += ` --surface ${args.surface}`;
      cmd += ` ${shellEscape(String(args.title))}`;
      return { content: [{ type: "text" as const, text: await runCmux(cmd) }] };
    }
    case "new_split": {
      let cmd = `new-split ${args.direction}`;
      if (args.workspace) cmd += ` --workspace ${args.workspace}`;
      if (args.surface) cmd += ` --surface ${args.surface}`;
      if (args.panel) cmd += ` --panel ${args.panel}`;
      return { content: [{ type: "text" as const, text: await runCmux(cmd) }] };
    }
    case "drag_surface_to_split":
      return { content: [{ type: "text" as const, text: await runCmux(`drag-surface-to-split --surface ${args.surface} ${args.direction}`) }] };
    case "refresh_surfaces":
      return { content: [{ type: "text" as const, text: await runCmux('refresh-surfaces') }] };
    case "surface_health": {
      let cmd = 'surface-health';
      if (args.workspace) cmd += ` --workspace ${args.workspace}`;
      return { content: [{ type: "text" as const, text: await runCmux(cmd) }] };
    }

    // === Pane ===
    case "list_panes": {
      let cmd = 'list-panes';
      if (args.workspace) cmd += ` --workspace ${args.workspace}`;
      return { content: [{ type: "text" as const, text: await runCmux(cmd) }] };
    }
    case "new_pane": {
      let cmd = `new-pane --type terminal --direction ${args.direction || 'right'}`;
      if (args.workspace) cmd += ` --workspace ${args.workspace}`;
      return { content: [{ type: "text" as const, text: `New pane created. ${await runCmux(cmd)}` }] };
    }
    case "focus_pane": {
      let cmd = `focus-pane --pane ${args.pane}`;
      if (args.workspace) cmd += ` --workspace ${args.workspace}`;
      return { content: [{ type: "text" as const, text: await runCmux(cmd) }] };
    }
    case "resize_pane": {
      let cmd = `resize-pane --pane ${args.pane} -${args.direction}`;
      if (args.amount) cmd += ` --amount ${args.amount}`;
      if (args.workspace) cmd += ` --workspace ${args.workspace}`;
      return { content: [{ type: "text" as const, text: await runCmux(cmd) }] };
    }
    case "swap_pane": {
      let cmd = `swap-pane --pane ${args.pane} --target-pane ${args.target_pane}`;
      if (args.workspace) cmd += ` --workspace ${args.workspace}`;
      return { content: [{ type: "text" as const, text: await runCmux(cmd) }] };
    }
    case "break_pane": {
      let cmd = 'break-pane';
      if (args.pane) cmd += ` --pane ${args.pane}`;
      if (args.workspace) cmd += ` --workspace ${args.workspace}`;
      if (args.surface) cmd += ` --surface ${args.surface}`;
      return { content: [{ type: "text" as const, text: await runCmux(cmd) }] };
    }
    case "join_pane": {
      let cmd = `join-pane --target-pane ${args.target_pane}`;
      if (args.pane) cmd += ` --pane ${args.pane}`;
      if (args.workspace) cmd += ` --workspace ${args.workspace}`;
      if (args.surface) cmd += ` --surface ${args.surface}`;
      return { content: [{ type: "text" as const, text: await runCmux(cmd) }] };
    }
    case "last_pane": {
      let cmd = 'last-pane';
      if (args.workspace) cmd += ` --workspace ${args.workspace}`;
      return { content: [{ type: "text" as const, text: await runCmux(cmd) }] };
    }
    case "list_panels": {
      let cmd = 'list-panels';
      if (args.workspace) cmd += ` --workspace ${args.workspace}`;
      return { content: [{ type: "text" as const, text: await runCmux(cmd) }] };
    }
    case "focus_panel": {
      let cmd = `focus-panel --panel ${args.panel}`;
      if (args.workspace) cmd += ` --workspace ${args.workspace}`;
      return { content: [{ type: "text" as const, text: await runCmux(cmd) }] };
    }

    // === Window ===
    case "list_windows": return { content: [{ type: "text" as const, text: await runCmux('list-windows') }] };
    case "new_window": return { content: [{ type: "text" as const, text: `New window created. ${await runCmux('new-window')}` }] };
    case "close_window": return { content: [{ type: "text" as const, text: `Window closed. ${await runCmux(`close-window --window ${args.window}`)}` }] };
    case "focus_window": return { content: [{ type: "text" as const, text: await runCmux(`focus-window --window ${args.window}`) }] };
    case "current_window": return { content: [{ type: "text" as const, text: await runCmux('current-window') }] };
    case "rename_window": {
      let cmd = 'rename-window';
      if (args.workspace) cmd += ` --workspace ${args.workspace}`;
      cmd += ` ${shellEscape(String(args.title))}`;
      return { content: [{ type: "text" as const, text: await runCmux(cmd) }] };
    }
    case "next_window": return { content: [{ type: "text" as const, text: await runCmux('next-window') }] };
    case "previous_window": return { content: [{ type: "text" as const, text: await runCmux('previous-window') }] };
    case "last_window": return { content: [{ type: "text" as const, text: await runCmux('last-window') }] };
    case "move_workspace_to_window":
      return { content: [{ type: "text" as const, text: await runCmux(`move-workspace-to-window --workspace ${args.workspace} --window ${args.window}`) }] };

    // === Workspace ===
    case "list_workspaces": return { content: [{ type: "text" as const, text: await runCmux('list-workspaces') }] };
    case "new_workspace": {
      let cmd = 'new-workspace';
      if (args.cwd) cmd += ` --cwd ${shellEscape(String(args.cwd))}`;
      if (args.command) cmd += ` --command ${shellEscape(String(args.command))}`;
      return { content: [{ type: "text" as const, text: `New workspace created. ${await runCmux(cmd)}` }] };
    }
    case "close_workspace": return { content: [{ type: "text" as const, text: await runCmux(`close-workspace --workspace ${args.workspace}`) }] };
    case "select_workspace": return { content: [{ type: "text" as const, text: await runCmux(`select-workspace --workspace ${args.workspace}`) }] };
    case "rename_workspace": {
      let cmd = 'rename-workspace';
      if (args.workspace) cmd += ` --workspace ${args.workspace}`;
      cmd += ` ${shellEscape(String(args.title))}`;
      return { content: [{ type: "text" as const, text: await runCmux(cmd) }] };
    }
    case "current_workspace": return { content: [{ type: "text" as const, text: await runCmux('current-workspace') }] };
    case "reorder_workspace": {
      let cmd = `reorder-workspace --workspace ${args.workspace}`;
      if (args.index !== undefined) cmd += ` --index ${args.index}`;
      if (args.before) cmd += ` --before ${args.before}`;
      if (args.after) cmd += ` --after ${args.after}`;
      return { content: [{ type: "text" as const, text: await runCmux(cmd) }] };
    }

    // === Search ===
    case "find_window": {
      let cmd = 'find-window';
      if (args.content) cmd += ' --content';
      if (args.select) cmd += ' --select';
      cmd += ` ${shellEscape(String(args.query))}`;
      return { content: [{ type: "text" as const, text: await runCmux(cmd) }] };
    }

    // === Structure ===
    case "tree": {
      let cmd = 'tree';
      if (args.all) cmd += ' --all';
      if (args.workspace) cmd += ` --workspace ${args.workspace}`;
      return { content: [{ type: "text" as const, text: await runCmux(cmd) }] };
    }
    case "identify": {
      let cmd = 'identify';
      if (args.workspace) cmd += ` --workspace ${args.workspace}`;
      if (args.surface) cmd += ` --surface ${args.surface}`;
      return { content: [{ type: "text" as const, text: await runCmux(cmd) }] };
    }

    // === Notifications ===
    case "notify": {
      let cmd = `notify --title ${shellEscape(String(args.title))}`;
      if (args.subtitle) cmd += ` --subtitle ${shellEscape(String(args.subtitle))}`;
      if (args.body) cmd += ` --body ${shellEscape(String(args.body))}`;
      if (args.workspace) cmd += ` --workspace ${args.workspace}`;
      if (args.surface) cmd += ` --surface ${args.surface}`;
      return { content: [{ type: "text" as const, text: await runCmux(cmd) }] };
    }
    case "list_notifications": return { content: [{ type: "text" as const, text: await runCmux('list-notifications') }] };
    case "clear_notifications": return { content: [{ type: "text" as const, text: await runCmux('clear-notifications') }] };

    // === Sidebar ===
    case "set_status": {
      let cmd = `set-status ${shellEscape(String(args.key))} ${shellEscape(String(args.value))}`;
      if (args.icon) cmd += ` --icon ${shellEscape(String(args.icon))}`;
      if (args.color) cmd += ` --color ${args.color}`;
      if (args.workspace) cmd += ` --workspace ${args.workspace}`;
      return { content: [{ type: "text" as const, text: await runCmux(cmd) }] };
    }
    case "clear_status": {
      let cmd = `clear-status ${shellEscape(String(args.key))}`;
      if (args.workspace) cmd += ` --workspace ${args.workspace}`;
      return { content: [{ type: "text" as const, text: await runCmux(cmd) }] };
    }
    case "list_status": {
      let cmd = 'list-status';
      if (args.workspace) cmd += ` --workspace ${args.workspace}`;
      return { content: [{ type: "text" as const, text: await runCmux(cmd) }] };
    }
    case "set_progress": {
      let cmd = `set-progress ${args.value}`;
      if (args.label) cmd += ` --label ${shellEscape(String(args.label))}`;
      if (args.workspace) cmd += ` --workspace ${args.workspace}`;
      return { content: [{ type: "text" as const, text: await runCmux(cmd) }] };
    }
    case "clear_progress": {
      let cmd = 'clear-progress';
      if (args.workspace) cmd += ` --workspace ${args.workspace}`;
      return { content: [{ type: "text" as const, text: await runCmux(cmd) }] };
    }
    case "sidebar_state": {
      let cmd = 'sidebar-state';
      if (args.workspace) cmd += ` --workspace ${args.workspace}`;
      return { content: [{ type: "text" as const, text: await runCmux(cmd) }] };
    }

    // === Log ===
    case "log": {
      let cmd = 'log';
      if (args.level) cmd += ` --level ${args.level}`;
      if (args.source) cmd += ` --source ${shellEscape(String(args.source))}`;
      if (args.workspace) cmd += ` --workspace ${args.workspace}`;
      cmd += ` -- ${shellEscape(String(args.message))}`;
      return { content: [{ type: "text" as const, text: await runCmux(cmd) }] };
    }
    case "clear_log": {
      let cmd = 'clear-log';
      if (args.workspace) cmd += ` --workspace ${args.workspace}`;
      return { content: [{ type: "text" as const, text: await runCmux(cmd) }] };
    }
    case "list_log": {
      let cmd = 'list-log';
      if (args.limit) cmd += ` --limit ${args.limit}`;
      if (args.workspace) cmd += ` --workspace ${args.workspace}`;
      return { content: [{ type: "text" as const, text: await runCmux(cmd) }] };
    }

    // === Buffer ===
    case "set_buffer": {
      let cmd = 'set-buffer';
      if (args.name) cmd += ` --name ${shellEscape(String(args.name))}`;
      cmd += ` ${shellEscape(String(args.text))}`;
      return { content: [{ type: "text" as const, text: await runCmux(cmd) }] };
    }
    case "list_buffers": return { content: [{ type: "text" as const, text: await runCmux('list-buffers') }] };
    case "paste_buffer": {
      let cmd = 'paste-buffer';
      if (args.name) cmd += ` --name ${shellEscape(String(args.name))}`;
      if (args.workspace) cmd += ` --workspace ${args.workspace}`;
      if (args.surface) cmd += ` --surface ${args.surface}`;
      return { content: [{ type: "text" as const, text: await runCmux(cmd) }] };
    }

    // === Terminal Control ===
    case "clear_history": {
      let cmd = 'clear-history';
      if (args.workspace) cmd += ` --workspace ${args.workspace}`;
      if (args.surface) cmd += ` --surface ${args.surface}`;
      return { content: [{ type: "text" as const, text: await runCmux(cmd) }] };
    }
    case "respawn_pane": {
      let cmd = 'respawn-pane';
      if (args.workspace) cmd += ` --workspace ${args.workspace}`;
      if (args.surface) cmd += ` --surface ${args.surface}`;
      if (args.command) cmd += ` --command ${shellEscape(String(args.command))}`;
      return { content: [{ type: "text" as const, text: await runCmux(cmd) }] };
    }
    case "display_message": {
      let cmd = 'display-message';
      if (args.print) cmd += ' -p';
      cmd += ` ${shellEscape(String(args.text))}`;
      return { content: [{ type: "text" as const, text: await runCmux(cmd) }] };
    }
    case "trigger_flash": {
      let cmd = 'trigger-flash';
      if (args.workspace) cmd += ` --workspace ${args.workspace}`;
      if (args.surface) cmd += ` --surface ${args.surface}`;
      return { content: [{ type: "text" as const, text: await runCmux(cmd) }] };
    }
    case "pipe_pane": {
      let cmd = `pipe-pane --command ${shellEscape(String(args.command))}`;
      if (args.workspace) cmd += ` --workspace ${args.workspace}`;
      if (args.surface) cmd += ` --surface ${args.surface}`;
      return { content: [{ type: "text" as const, text: await runCmux(cmd) }] };
    }
    case "capture_pane": {
      let cmd = 'capture-pane';
      if (args.workspace) cmd += ` --workspace ${args.workspace}`;
      if (args.surface) cmd += ` --surface ${args.surface}`;
      if (args.scrollback) cmd += ' --scrollback';
      if (args.lines) cmd += ` --lines ${args.lines}`;
      return { content: [{ type: "text" as const, text: await runCmux(cmd) }] };
    }

    // === Hooks & Misc ===
    case "set_hook": {
      if (args.list) return { content: [{ type: "text" as const, text: await runCmux('set-hook --list') }] };
      if (args.unset) return { content: [{ type: "text" as const, text: await runCmux(`set-hook --unset ${shellEscape(String(args.unset))}`) }] };
      return { content: [{ type: "text" as const, text: await runCmux(`set-hook ${shellEscape(String(args.event))} ${shellEscape(String(args.command))}`) }] };
    }
    case "wait_for": {
      let cmd = 'wait-for';
      if (args.signal) cmd += ' -S';
      cmd += ` ${shellEscape(String(args.name))}`;
      if (args.timeout) cmd += ` --timeout ${args.timeout}`;
      return { content: [{ type: "text" as const, text: await runCmux(cmd) }] };
    }
    case "set_app_focus": return { content: [{ type: "text" as const, text: await runCmux(`set-app-focus ${args.state}`) }] };
    case "markdown_open": return { content: [{ type: "text" as const, text: await runCmux(`markdown open ${shellEscape(String(args.path))}`) }] };
    case "version": return { content: [{ type: "text" as const, text: await runCmux('version') }] };
    case "ping": return { content: [{ type: "text" as const, text: await runCmux('ping') }] };

    // === Browser ===
    case "browser": {
      let cmd = 'browser';
      if (args.surface) cmd += ` --surface ${args.surface}`;
      cmd += ` ${args.subcommand}`;
      if (args.args) cmd += ` ${args.args}`;
      return { content: [{ type: "text" as const, text: await runCmux(cmd) }] };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
