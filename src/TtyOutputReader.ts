import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execPromise = promisify(exec);

export default class TtyOutputReader {
  static async call(linesOfOutput?: number, surface?: string) {
    if (linesOfOutput) {
      const surfaceArg = surface ? ` --surface ${surface}` : '';
      const { stdout } = await execPromise(`cmux read-screen --lines ${linesOfOutput}${surfaceArg}`);
      return stdout.trimEnd();
    }
    return this.retrieveBuffer(surface);
  }

  static async retrieveBuffer(surface?: string): Promise<string> {
    try {
      const surfaceArg = surface ? ` --surface ${surface}` : '';
      const { stdout } = await execPromise(`cmux read-screen --scrollback${surfaceArg}`);
      return stdout.trimEnd();
    } catch (error: unknown) {
      throw new Error(`Failed to read terminal: ${(error as Error).message}`);
    }
  }
}
