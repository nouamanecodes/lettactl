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
  toUpdateValue: Array<{ name: string; id: string; newValue: string }>; // For mutable: false blocks
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

export interface FieldChange<T> {
  from: T;
  to: T;
}

export interface AgentUpdateOperations {
  // Basic agent field updates (preserve conversation)
  updateFields?: {
    system?: string;
    description?: FieldChange<string>;
    model?: FieldChange<string>;
    embedding?: FieldChange<string>;
    contextWindow?: FieldChange<number>;
  };

  // Resource management operations
  tools?: ToolDiff;
  blocks?: BlockDiff;
  folders?: FolderDiff;

  // Metadata
  preservesConversation: boolean;
  operationCount: number;
}
