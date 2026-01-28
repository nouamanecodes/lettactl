export interface ListRunsOptions {
  active?: boolean;
  agent?: string;
  limit?: number;
  output?: string;
}

export interface GetRunOptions {
  wait?: boolean;
  stream?: boolean;
  messages?: boolean;
  output?: string;
}
