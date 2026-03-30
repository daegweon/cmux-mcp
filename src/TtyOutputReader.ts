import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execPromise = promisify(exec);

export default class TtyOutputReader {
  static async call(linesOfOutput?: number) {
    if (linesOfOutput) {
      const { stdout } = await execPromise(`cmux read-screen --lines ${linesOfOutput}`);
      return stdout.trimEnd();
    }
    return this.retrieveBuffer();
  }

  static async retrieveBuffer(): Promise<string> {
    try {
      const { stdout } = await execPromise('cmux read-screen --scrollback');
      return stdout.trimEnd();
    } catch (error: unknown) {
      throw new Error(`Failed to read terminal: ${(error as Error).message}`);
    }
  }
}
