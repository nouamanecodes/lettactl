export interface ToolDiff {
  toAdd: Array<{ name: string; id: string }>;
  toRemove: Array<{ name: string; id: string }>;
  toUpdate: Array<{ name: string; currentId: string; newId: string; reason: string }>;
  unchanged: Array<{ name: string; id: string }>;
}

export interface BlockDiff {
  toAdd: Array<{ name: string; id: string }>;
  toRemove: Array<{ name: string; id: string }>;
  toUpdate: Array<{ name: string; currentId: string; newId: string }>;
  toUpdateValue: Array<{ name: string; id: string; oldValue: string; newValue: string }>; // For agent_owned: false blocks
  unchanged: Array<{ name: string; id: string }>;
}

export interface FolderDiff {
  toAttach: Array<{ name: string; id: string }>;
  toDetach: Array<{ name: string; id: string }>;
  toUpdate: Array<{
    name: string;
    id: string;
    filesToAdd: string[];
    filesToRemove: string[];
    filesToUpdate: string[];
  }>;
  unchanged: Array<{ name: string; id: string }>;
}

export interface ArchiveDiff {
  toAttach: Array<{ name: string; id: string }>;
  toDetach: Array<{ name: string; id: string }>;
  toUpdate: Array<{ name: string; id: string; description?: string | null }>;
  unchanged: Array<{ name: string; id: string }>;
}

export interface FieldChange<T> {
  from: T;
  to: T;
}

export interface AgentUpdateOperations {
  // Basic agent field updates (preserve conversation)
  updateFields?: {
    system?: FieldChange<string>;
    description?: FieldChange<string>;
    model?: FieldChange<string>;
    embedding?: FieldChange<string>;
    embeddingConfig?: FieldChange<Record<string, any> | null>;
    contextWindow?: FieldChange<number>;
    reasoning?: FieldChange<boolean>;
    tags?: FieldChange<string[]>;
  };

  // Resource management operations
  tools?: ToolDiff;
  blocks?: BlockDiff;
  folders?: FolderDiff;
  archives?: ArchiveDiff;

  // Metadata
  preservesConversation: boolean;
  operationCount: number;
}
