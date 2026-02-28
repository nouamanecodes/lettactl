export interface ListOptions {
  limit?: number;
  all?: boolean;
  system?: boolean;
  order?: string;
  before?: string;
  after?: string;
  output?: string;
  conversationId?: string;
}

export interface SendOptions {
  stream?: boolean;
  sync?: boolean;
  noWait?: boolean;
  maxSteps?: number;
  enableThinking?: boolean;
  all?: string;
  file?: string;
  confirm?: boolean;
  timeout?: number;
  output?: string;
  conversationId?: string;
}

export interface ResetOptions {
  addDefault?: boolean;
}

export interface CompactOptions {
  conversationId?: string;
  model?: string;
}

export interface CancelOptions {
  runIds?: string;
}
