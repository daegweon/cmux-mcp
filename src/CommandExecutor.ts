import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { openSync, closeSync } from 'node:fs';
import ProcessTracker from './ProcessTracker.js';
import TtyOutputReader from './TtyOutputReader.js';

/**
 * CommandExecutor handles sending commands to cmux terminal via cmux CLI.
 */

const execPromise = promisify(exec);
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

class CommandExecutor {
  private _execPromise: typeof execPromise;

  constructor(execPromiseOverride?: typeof execPromise) {
    this._execPromise = execPromiseOverride || execPromise;
  }

  /**
   * Executes a command in the cmux terminal.
   *
   * Uses `cmux send` CLI to send text with \n appended to simulate Enter.
   * Then waits for the command to complete by monitoring process activity.
   *
   * @param command The command to execute (can contain newlines)
   * @returns A promise that resolves to the terminal output after command execution
   */
  async executeCommand(command: string): Promise<string> {
    try {
      // cmux send handles \n as Enter natively
      // Append \n to simulate pressing Enter after the command
      const textToSend = command + '\n';

      // Use cmux send CLI - escape for shell safely
      await this._execPromise(`cmux send -- ${this.shellEscape(textToSend)}`);

      // Get the TTY path and check if it's waiting for user input
      const ttyPath = await this.retrieveTtyPath();
      while (await this.isWaitingForUserInput(ttyPath) === false) {
        await sleep(100);
      }

      // Give a small delay for output to settle
      await sleep(200);

      // Retrieve the terminal output after command execution
      const afterCommandBuffer = await TtyOutputReader.retrieveBuffer();
      return afterCommandBuffer;
    } catch (error: unknown) {
      throw new Error(`Failed to execute command: ${(error as Error).message}`);
    }
  }

  async isWaitingForUserInput(ttyPath: string): Promise<boolean> {
    let fd;
    try {
      fd = openSync(ttyPath, 'r');
      const tracker = new ProcessTracker();
      let belowThresholdTime = 0;

      while (true) {
        try {
          const activeProcess = await tracker.getActiveProcess(ttyPath);

          if (!activeProcess) return true;

          if (activeProcess.metrics.totalCPUPercent < 1) {
            belowThresholdTime += 350;
            if (belowThresholdTime >= 1000) return true;
          } else {
            belowThresholdTime = 0;
          }
        } catch {
          return true;
        }

        await sleep(350);
      }
    } catch (error: unknown) {
      return true;
    } finally {
      if (fd !== undefined) {
        closeSync(fd);
      }
      return true;
    }
  }

  /**
   * Escapes a string for safe use as a shell argument.
   * Uses single-quote wrapping with proper escaping.
   */
  private shellEscape(str: string): string {
    // Replace single quotes with '\'' (end quote, escaped quote, start quote)
    return "'" + str.replace(/'/g, "'\\''") + "'";
  }

  private async retrieveTtyPath(): Promise<string> {
    try {
      const { stdout } = await this._execPromise(
        `lsof -c cmux 2>/dev/null | grep /dev/ttys | awk '{print $9}' | sort -u | head -1`
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
        return fallbackTty;
      }
      return tty;
    } catch (error: unknown) {
      throw new Error(`Failed to retrieve TTY path: ${(error as Error).message}`);
    }
  }
}

export default CommandExecutor;
