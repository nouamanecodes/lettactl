import ora from 'ora';

export interface SpinnerInterface {
  start(): SpinnerInterface;
  succeed(text?: string): SpinnerInterface;
  fail(text?: string): SpinnerInterface;
  stop(): SpinnerInterface;
}

class NoSpinner implements SpinnerInterface {
  start(): SpinnerInterface {
    return this;
  }

  succeed(text?: string): SpinnerInterface {
    if (text) console.log(`✓ ${text}`);
    return this;
  }

  fail(text?: string): SpinnerInterface {
    if (text) console.log(`✗ ${text}`);
    return this;
  }

  stop(): SpinnerInterface {
    return this;
  }
}

export function createSpinner(text: string, enabled: boolean = true): SpinnerInterface {
  if (!enabled) {
    console.log(text);
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