import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { openSync, closeSync } from 'node:fs';
import ProcessTracker from './ProcessTracker.js';
import TtyOutputReader from './TtyOutputReader.js';

const execPromise = promisify(exec);
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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
      await this._execPromise(`cmux send${surfaceArg} -- ${this.shellEscape(textToSend)}`);

      const ttyPath = await this.retrieveTtyPath();
      while (await this.isWaitingForUserInput(ttyPath) === false) {
        await sleep(100);
      }

      await sleep(200);

      const afterCommandBuffer = await TtyOutputReader.retrieveBuffer(this._surface);
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

  private shellEscape(str: string): string {
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
