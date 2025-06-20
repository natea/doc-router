export interface PromptField {
  name: string;
  type: 'str' | 'int' | 'float' | 'bool' | 'datetime';
}

export interface PromptConfig {
  name: string;
  content: string;
  schema_id?: string;
  schema_version?: number;
  tag_ids?: string[];
  model?: string;
}

export interface Prompt extends PromptConfig {
  prompt_revid: string;
  prompt_id: string;
  prompt_version: number;
  created_at: string;
  created_by: string;
}

export interface CreatePromptParams {
  organizationId: string;
  prompt: PromptConfig;
}

export interface ListPromptsParams {
  organizationId: string;
  skip?: number;
  limit?: number;
  document_id?: string;
  tag_ids?: string;
}

export interface ListPromptsResponse {
  prompts: Prompt[];
  total_count: number;
  skip: number;
}

export interface GetPromptParams {
  organizationId: string;
  prompt_id: string;
}

export interface UpdatePromptParams {
  organizationId: string;
  prompt_id: string;
  prompt: PromptConfig;
}

export interface DeletePromptParams {
  organizationId: string;
  prompt_id: string;
}
