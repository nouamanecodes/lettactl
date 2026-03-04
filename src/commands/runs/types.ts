export interface ListRunsOptions {
  active?: boolean;
  agent?: string;
  limit?: number;
  output?: string;
  watch?: boolean;
}

export interface GetRunOptions {
  wait?: boolean;
  stream?: boolean;
  messages?: boolean;
  output?: string;
}

export interface TrackRunsOptions {
  agent?: string;
  output?: string;
}
