export const SUPPORTED_REPORT_TYPES = ['memory'];

export interface ReportOptions {
  output?: string;        // table | json
  all?: boolean;          // all agents
  match?: string;         // glob pattern
  tags?: string;          // comma-separated tags
  analyze?: boolean;      // LLM analysis mode
  confirm?: boolean;      // skip confirmation prompt
}
