import ora from 'ora';
import { isQuietMode, output } from '../shared/logger';

export interface SpinnerInterface {
  text: string;
  start(): SpinnerInterface;
  succeed(text?: string): SpinnerInterface;
  fail(text?: string): SpinnerInterface;
  stop(): SpinnerInterface;
}

class NoSpinner implements SpinnerInterface {
  text: string = '';

  start(): SpinnerInterface {
    return this;
  }

  succeed(text?: string): SpinnerInterface {
    if (text) output(`[OK] ${text}`);
    return this;
  }

  fail(text?: string): SpinnerInterface {
    if (text) output(`[FAIL] ${text}`);
    return this;
  }

  stop(): SpinnerInterface {
    return this;
  }
}

class QuietSpinner implements SpinnerInterface {
  text: string = '';

  start(): SpinnerInterface {
    return this;
  }

  succeed(_text?: string): SpinnerInterface {
    return this;
  }

  fail(_text?: string): SpinnerInterface {
    return this;
  }

  stop(): SpinnerInterface {
    return this;
  }
}

export function createSpinner(text: string, enabled: boolean = true): SpinnerInterface {
  // Quiet mode always returns silent spinner
  if (isQuietMode()) {
    return new QuietSpinner();
  }
  if (!enabled) {
    output(text);
    return new NoSpinner();
  }
  return ora(text);
}

export function getSpinnerEnabled(command: any): boolean {
  // Check for --no-spinner flag at the parent level
  // Handle cases where opts() might not be available (like in tests)
  const parentOpts = command?.parent?.opts?.() || {};
  const commandOpts = command?.opts?.() || {};
  return !(parentOpts.noSpinner || commandOpts.noSpinner);
}

export function getQuietMode(command: any): boolean {
  const parentOpts = command?.parent?.opts?.() || {};
  const commandOpts = command?.opts?.() || {};
  return parentOpts.quiet || commandOpts.quiet || false;
}
