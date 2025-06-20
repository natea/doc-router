export interface Integration {
  id: string;
  name: string;
  type: 'erp' | 'app' | 'api' | 'database' | 'webhook';
  status: 'active' | 'inactive' | 'pending' | 'error';
  organization_id: string;
  config: IntegrationConfig;
  description?: string;
  icon?: string;
  created_at: string;
  updated_at: string;
  last_sync?: string;
  error_message?: string;
}

export interface IntegrationConfig {
  // Common fields
  api_key?: string;
  endpoint_url?: string;
  username?: string;
  password?: string;
  
  // ERP specific
  company_code?: string;
  database_name?: string;
  
  // OAuth specific
  client_id?: string;
  client_secret?: string;
  access_token?: string;
  refresh_token?: string;
  
  // Webhook specific
  webhook_url?: string;
  secret?: string;
  events?: string[];
  
  // Additional custom fields
  [key: string]: any;
}

export interface IntegrationTemplate {
  type: Integration['type'];
  name: string;
  description: string;
  icon: string;
  requiredFields: IntegrationField[];
  optionalFields?: IntegrationField[];
}

export interface IntegrationField {
  key: string;
  label: string;
  type: 'text' | 'password' | 'url' | 'select' | 'multiselect';
  placeholder?: string;
  required?: boolean;
  options?: { value: string; label: string }[];
  helperText?: string;
}

export interface CreateIntegrationRequest {
  name: string;
  type: Integration['type'];
  organization_id: string;
  config: IntegrationConfig;
  description?: string;
}

export interface UpdateIntegrationRequest {
  name?: string;
  status?: Integration['status'];
  config?: IntegrationConfig;
  description?: string;
}

export interface IntegrationListResponse {
  integrations: Integration[];
  total_count: number;
}

export interface TestIntegrationResponse {
  success: boolean;
  message: string;
  details?: any;
}