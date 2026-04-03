import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { openSync, closeSync } from 'node:fs';
import ProcessTracker from './ProcessTracker.js';
import TtyOutputReader from './TtyOutputReader.js';
import { CMUX_BIN } from './cmux-path.js';

const execPromise = promisify(exec);
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// TTY path cache — path rarely changes during a session
let cachedTtyPath: string | null = null;
let ttyPathCacheTime = 0;
const TTY_CACHE_TTL_MS = 60_000; // 1 minute

class CommandExecutor {
  private _execPromise: typeof execPromise;
  private _surface?: string;

  constructor(execPromiseOverride?: typeof execPromise, surface?: string) {
    this._execPromise = execPromiseOverride || execPromise;
    this._surface = surface;
  }

  async executeCommand(command: string): Promise<string> {
    try {
      const textToSend = command + '\n';
      const surfaceArg = this._surface ? ` --surface ${this._surface}` : '';
      await this._execPromise(`${CMUX_BIN} send${surfaceArg} -- ${this.shellEscape(textToSend)}`);

      const ttyPath = await this.retrieveTtyPath();
      await this.waitForCommandCompletion(ttyPath);

      const afterCommandBuffer = await TtyOutputReader.retrieveBuffer(this._surface);
      return afterCommandBuffer;
    } catch (error: unknown) {
      throw new Error(`Failed to execute command: ${(error as Error).message}`);
    }
  }

  /**
   * Wait until the command finishes by polling CPU usage.
   * Uses shorter intervals and lower threshold for faster response.
   */
  private async waitForCommandCompletion(ttyPath: string): Promise<void> {
    let fd;
    try {
      fd = openSync(ttyPath, 'r');
      const tracker = new ProcessTracker();
      let belowThresholdTime = 0;
      const POLL_INTERVAL_MS = 150;
      const IDLE_THRESHOLD_MS = 500;

      while (true) {
        try {
          const activeProcess = await tracker.getActiveProcess(ttyPath);

          if (!activeProcess) return;

          if (activeProcess.metrics.totalCPUPercent < 1) {
            belowThresholdTime += POLL_INTERVAL_MS;
            if (belowThresholdTime >= IDLE_THRESHOLD_MS) return;
          } else {
            belowThresholdTime = 0;
          }
        } catch {
          return;
        }

        await sleep(POLL_INTERVAL_MS);
      }
    } catch {
      return;
    } finally {
      if (fd !== undefined) {
        closeSync(fd);
      }
    }
  }

  private shellEscape(str: string): string {
    return "'" + str.replace(/'/g, "'\\''") + "'";
  }

  private async retrieveTtyPath(): Promise<string> {
    // Return cached path if still fresh
    if (cachedTtyPath && (Date.now() - ttyPathCacheTime) < TTY_CACHE_TTL_MS) {
      return cachedTtyPath;
    }

    try {
      const { stdout } = await this._execPromise(
        `lsof -c cmux 2>/dev/null | grep /dev/ttys | awk '{print $9}' | sort -u | head -1 || lsof -p $(pgrep -f 'cmux.app/Contents/MacOS/cmux' | head -1) 2>/dev/null | grep /dev/ttys | awk '{print $9}' | sort -u | head -1`
      );
      const tty = stdout.trim();
      if (!tty) {
        const { stdout: psTty } = await this._execPromise(
          `ps -eo tty,lstart,comm | grep -E '(bash|zsh|sh|fish)$' | grep -v grep | sort -k2 | tail -1 | awk '{print "/dev/" $1}'`
        );
        const fallbackTty = psTty.trim();
        if (!fallbackTty || fallbackTty === '/dev/') {
          throw new Error('Could not find TTY for cmux terminal');
        }
        cachedTtyPath = fallbackTty;
        ttyPathCacheTime = Date.now();
        return fallbackTty;
      }
      cachedTtyPath = tty;
      ttyPathCacheTime = Date.now();
      return tty;
    } catch (error: unknown) {
      throw new Error(`Failed to retrieve TTY path: ${(error as Error).message}`);
    }
  }
}

export default CommandExecutor;
