import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execPromise = promisify(exec);

class SendControlCharacter {
  protected async executeCommand(command: string): Promise<void> {
    await execPromise(command);
  }

  async send(letter: string): Promise<void> {
    let keyName: string;

    // Handle special cases
    if (letter.toUpperCase() === ']') {
      // Telnet escape character - ASCII 29, send as raw control character
      // cmux send-key doesn't have a name for this, use cmux send with escape sequence
      await this.executeCommand(`cmux send -- $'\\x1d'`);
      return;
    }
    else if (letter.toUpperCase() === 'ESCAPE' || letter.toUpperCase() === 'ESC') {
      keyName = 'escape';
    }
    else {
      letter = letter.toUpperCase();
      if (!/^[A-Z]$/.test(letter)) {
        throw new Error('Invalid control character letter');
      }
      // Convert to ctrl+<letter> format for cmux send-key
      keyName = `ctrl+${letter.toLowerCase()}`;
    }

    try {
      await this.executeCommand(`cmux send-key ${keyName}`);
    } catch (error: unknown) {
      throw new Error(`Failed to send control character: ${(error as Error).message}`);
    }
  }
}

export default SendControlCharacter;
