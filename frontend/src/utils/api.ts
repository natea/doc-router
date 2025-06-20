import axios, { isAxiosError } from 'axios';
import { getSession } from 'next-auth/react';
import { AppSession } from '@/types/AppSession';
import { 
  UploadDocumentsParams,
  UploadDocumentsResponse,
  GetDocumentParams,
  GetDocumentResponse,
  UpdateDocumentParams,
  DeleteDocumentParams,
  ListDocumentsParams,
} from '@/types/index';
import {
  GetOCRBlocksParams,
  GetOCRTextParams,
  GetOCRMetadataParams,
  GetOCRMetadataResponse
} from '@/types/index';
import { 
  UserCreate, 
  UserUpdate, 
  UserResponse, 
  ListUsersParams, 
  ListUsersResponse 
} from '@/types/index';
import { 
  CreateOrganizationRequest, 
  ListOrganizationsResponse, 
  Organization, 
  UpdateOrganizationRequest 
} from '@/types/index';
import { 
  Schema, 
  CreateSchemaParams,
  ListSchemasParams, 
  ListSchemasResponse, 
  GetSchemaParams,
  UpdateSchemaParams,
  DeleteSchemaParams,
} from '@/types/index';
import { 
  InvitationResponse, 
  CreateInvitationRequest, 
  ListInvitationsParams, 
  ListInvitationsResponse, 
  AcceptInvitationRequest 
} from '@/types/index';
import { CreateTokenRequest } from '@/types/index';
import { AWSCredentials } from '@/types/index';
import {
  ListLLMModelsParams,
  ListLLMModelsResponse,
  ListLLMProvidersResponse,
  SetLLMProviderConfigRequest,
  RunLLMParams,
  RunLLMResponse, 
  GetLLMResultParams,
  GetLLMResultResponse,
  DeleteLLMResultParams,
} from '@/types/index';
import { 
  Prompt,
  CreatePromptParams,
  ListPromptsResponse, 
  ListPromptsParams,
  GetPromptParams,
  UpdatePromptParams,
  DeletePromptParams,
} from '@/types/index';
import { 
  Tag, 
  ListTagsResponse,
  CreateTagParams,
  ListTagsParams,
  UpdateTagParams,
  DeleteTagParams,
} from '@/types/index';
import { 
  Flow, 
  ListFlowsResponse,
  CreateFlowParams,
  UpdateFlowParams,
  ListFlowsParams,
  GetFlowParams,
  DeleteFlowParams,
} from '@/types/index';
import { 
  PortalSessionCreate,
  PortalSessionResponse,
  SubscriptionPlanResponse,
  SubscriptionHistoryResponse 
} from '@/types/index';
import { toast } from 'react-toastify';
import { JsonValue } from 'type-fest';

// These APIs execute from the frontend
const NEXT_PUBLIC_FASTAPI_FRONTEND_URL = process.env.NEXT_PUBLIC_FASTAPI_FRONTEND_URL || "http://localhost:8000";

const api = axios.create({
  baseURL: NEXT_PUBLIC_FASTAPI_FRONTEND_URL, 
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

// Add authorization header to all requests
api.interceptors.request.use(async (config) => {
  const session = await getSession() as AppSession | null;
  if (session?.apiAccessToken) {
    config.headers.Authorization = `Bearer ${session.apiAccessToken}`;
  } else {
    console.warn('No API token found in session');
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

// Add a request queue to handle concurrent requests during token refresh
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value?: unknown) => void;
  reject: (error: Error) => void;
}> = [];

const processQueue = (error: Error | null = null) => {
  failedQueue.forEach(prom => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve();
    }
  });
  failedQueue = [];
};

// Store the toast ID outside the interceptor
let sessionExpiredToastId: React.ReactText | null = null;

// Add a response interceptor that handles all errors
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Handle 401 errors (unauthorized)
    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then(() => api(originalRequest))
          .catch(() => {
            // Only show session expiration toast once
            if (!sessionExpiredToastId || !toast.isActive(sessionExpiredToastId)) {
              sessionExpiredToastId = toast.error('Your session has expired. Please login again.');
            }
            return Promise.reject(new Error('Session expired'));
          });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const session = await getSession() as AppSession;
        if (session?.apiAccessToken) {
          originalRequest.headers.Authorization = `Bearer ${session.apiAccessToken}`;
          processQueue();
          return api(originalRequest);
        } else {
          if (!sessionExpiredToastId || !toast.isActive(sessionExpiredToastId)) {
            sessionExpiredToastId = toast.error('Your session has expired. Please login again.');
          }
          return Promise.reject(new Error('Session expired'));
        }
      } catch (refreshError) {
        processQueue(refreshError instanceof Error ? refreshError : new Error('Token refresh failed'));
        if (!sessionExpiredToastId || !toast.isActive(sessionExpiredToastId)) {
          sessionExpiredToastId = toast.error('Your session has expired. Please login again.');
        }
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    // For all other errors, just pass through the error without showing toast
    if (isAxiosError(error)) {
      const responseData = error.response?.data as { detail?: string };
      if (responseData?.detail) {
        return Promise.reject(new Error(responseData.detail));
      }
    }

    return Promise.reject(error);
  }
);

// Document APIs
export const uploadDocumentsApi = async (params: UploadDocumentsParams): Promise<UploadDocumentsResponse> => {
  const { organizationId, documents } = params;
  const response = await api.post<UploadDocumentsResponse>(`/v0/orgs/${organizationId}/documents`, { documents: documents });
  return response.data;
};

export const listDocumentsApi = async (params?: ListDocumentsParams) => {
  const response = await api.get(`/v0/orgs/${params?.organizationId}/documents`, { 
    params: {
      skip: params?.skip || 0,
      limit: params?.limit || 10,
      tag_ids: params?.tagIds
    }
  });
  return response.data;
};

export const getDocumentApi = async (params: GetDocumentParams): Promise<GetDocumentResponse> => {
  const { organizationId, documentId, fileType } = params;
  // Always request the associated PDF
  const response = await api.get(`/v0/orgs/${organizationId}/documents/${documentId}?file_type=${fileType}`);
  const data = response.data;
  
  // Convert base64 content back to ArrayBuffer
  const binaryContent = atob(data.content);
  const len = binaryContent.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryContent.charCodeAt(i);
  }

  return {
    metadata: data.metadata,
    content: bytes.buffer
  };
};

export const updateDocumentApi = async (params: UpdateDocumentParams) => {
  const { organizationId, documentId, documentName, tagIds } = params;
  const updateData: { tag_ids?: string[]; document_name?: string } = {};
  
  if (documentName !== undefined) {
    updateData.document_name = documentName;
  }

  if (tagIds) {
    updateData.tag_ids = tagIds;
  }
  
  const response = await api.put(`/v0/orgs/${organizationId}/documents/${documentId}`, updateData);
  return response.data;
};

export const deleteDocumentApi = async (params: DeleteDocumentParams) => {
  const { organizationId, documentId } = params;
  const response = await api.delete(`/v0/orgs/${organizationId}/documents/${documentId}`);
  return response.data;
};

// OCR APIs
export const getOCRBlocksApi = async (params: GetOCRBlocksParams) => {
  const { organizationId, documentId } = params;
  const response = await api.get(`/v0/orgs/${organizationId}/ocr/download/blocks/${documentId}`);
  return response.data;
};

export const getOCRTextApi = async (params: GetOCRTextParams) => {
  const { organizationId, documentId, pageNum } = params;
  const url = `/v0/orgs/${organizationId}/ocr/download/text/${documentId}${pageNum ? `?page_num=${pageNum}` : ''}`;
  const response = await api.get(url);
  return response.data;
};

export const getOCRMetadataApi = async (params: GetOCRMetadataParams) => {
  const { organizationId, documentId } = params;
  const response = await api.get<GetOCRMetadataResponse>(`/v0/orgs/${organizationId}/ocr/download/metadata/${documentId}`);
  return response.data;
};

// LLM APIs
export const listLLMModelsApi = async (params: ListLLMModelsParams): Promise<ListLLMModelsResponse> => {
  const response = await api.get<ListLLMModelsResponse>('/v0/account/llm_models', {
    params: {
      provider_name: params.providerName,
      provider_enabled: params.providerEnabled,
      llm_enabled: params.llmEnabled,
    }
  });
  return response.data;
};

export const listLLMProvidersApi = async (): Promise<ListLLMProvidersResponse> => {
  const response = await api.get<ListLLMProvidersResponse>('/v0/account/llm_providers');
  return response.data;
};

export const setLLMProviderConfigApi = async (providerName: string, request: SetLLMProviderConfigRequest) => {
  const response = await api.put<SetLLMProviderConfigRequest>(`/v0/account/llm_provider/${providerName}`, request);
  return response.data;
};

export const runLLMApi = async (params: RunLLMParams) => {
  const { organizationId, documentId, promptId, force } = params;
  const response = await api.post<RunLLMResponse>(
    `/v0/orgs/${organizationId}/llm/run/${documentId}`,
    {},
    {
      params: {
        prompt_rev_id: promptId,
        force: force
      }
    }
  );
  return response.data;
};

export const getLLMResultApi = async (params: GetLLMResultParams) => {
  const { organizationId, documentId, promptId } = params;
  const response = await api.get<GetLLMResultResponse>(
    `/v0/orgs/${organizationId}/llm/result/${documentId}`,
    {
      params: {
        prompt_rev_id: promptId
      }
    }
  );
  return response.data;
};

export const updateLLMResultApi = async ({
  organizationId,
  documentId,
  promptId,
  result,
  isVerified = false
}: {
  organizationId: string;
  documentId: string;
  promptId: string;
  result: Record<string, JsonValue>;
  isVerified?: boolean;
}) => {
  const response = await api.put(
    `/v0/orgs/${organizationId}/llm/result/${documentId}`,
    {
      updated_llm_result: result,
      is_verified: isVerified
    },
    {
      params: {
        prompt_rev_id: promptId
      }
    }
  );

  if (response.status !== 200) {
    throw new Error(`Failed to update LLM result for document ${documentId} and prompt ${promptId}: ${response.data}`);
  }

  return response.data;
};

export const deleteLLMResultApi = async (params: DeleteLLMResultParams) => {
  const { organizationId, documentId, promptId } = params;
  const response = await api.delete(
    `/v0/orgs/${organizationId}/llm/result/${documentId}`,
    {
      params: {
        prompt_rev_id: promptId
      }
    }
  );
  return response.data;
};

// Schema APIs
export const createSchemaApi = async (schema: CreateSchemaParams) => {
  const { organizationId, ...schemaConfig } = schema;
  const response = await api.post<Schema>(`/v0/orgs/${organizationId}/schemas`, schemaConfig);
  return response.data;
};

export const listSchemasApi = async (params: ListSchemasParams): Promise<ListSchemasResponse> => {
  const { organizationId, ...rest } = params;
  const response = await api.get<ListSchemasResponse>(`/v0/orgs/${organizationId}/schemas`, {
    params: {
      skip: rest?.skip || 0,
      limit: rest?.limit || 10
    }
  });
  return response.data;
};

export const getSchemaApi = async (params: GetSchemaParams): Promise<Schema> => {
  const { organizationId, schema_id } = params;
  const response = await api.get<Schema>(`/v0/orgs/${organizationId}/schemas/${schema_id}`);
  return response.data;
};

export const updateSchemaApi = async (params: UpdateSchemaParams): Promise<Schema> => {
  const { organizationId, schema_id, schema } = params;
  const response = await api.put<Schema>(`/v0/orgs/${organizationId}/schemas/${schema_id}`, schema);
  return response.data;
};

export const deleteSchemaApi = async (params: DeleteSchemaParams) => {
  const { organizationId, schema_id } = params;
  const response = await api.delete(`/v0/orgs/${organizationId}/schemas/${schema_id}`);
  return response.data;
};

// Prompt APIs
export const createPromptApi = async (params: CreatePromptParams): Promise<Prompt> => {
  const { organizationId, prompt } = params;
  const response = await api.post<Prompt>(`/v0/orgs/${organizationId}/prompts`, prompt);
  return response.data;
};

export const listPromptsApi = async (params: ListPromptsParams): Promise<ListPromptsResponse> => {
  const { organizationId, ...rest } = params;
  const response = await api.get<ListPromptsResponse>(`/v0/orgs/${organizationId}/prompts`, {
    params: {
      skip: rest?.skip || 0,
      limit: rest?.limit || 10,
      document_id: rest?.document_id,
      tag_ids: rest?.tag_ids
    }
  });
  return response.data;
};

export const getPromptApi = async (params: GetPromptParams): Promise<Prompt> => {
  const { organizationId, promptId } = params;
  const response = await api.get<Prompt>(`/v0/orgs/${organizationId}/prompts/${promptId}`);
  return response.data;
};

export const updatePromptApi = async (params: UpdatePromptParams): Promise<Prompt> => {
  const { organizationId, promptId, prompt } = params;
  const response = await api.put<Prompt>(`/v0/orgs/${organizationId}/prompts/${promptId}`, prompt);
  return response.data;
};

export const deletePromptApi = async (params: DeletePromptParams): Promise<void> => {
  const { organizationId, promptId } = params;
  const response = await api.delete(`/v0/orgs/${organizationId}/prompts/${promptId}`);
  return response.data;
};

// Tag APIs
export const createTagApi = async (params: CreateTagParams): Promise<Tag> => {
    const { organizationId, tag } = params;
    const response = await api.post<Tag>(`/v0/orgs/${organizationId}/tags`, tag);
    return response.data;
};

export const listTagsApi = async (params: ListTagsParams): Promise<ListTagsResponse> => {
    const { organizationId } = params;
    const response = await api.get<ListTagsResponse>(`/v0/orgs/${organizationId}/tags`);
    return response.data;
};

export const updateTagApi = async (params: UpdateTagParams): Promise<Tag> => {
    const { organizationId, tagId, tag } = params;
    const response = await api.put<Tag>(`/v0/orgs/${organizationId}/tags/${tagId}`, tag);
    return response.data;
};

export const deleteTagApi = async (params: DeleteTagParams): Promise<void> => {
  const { organizationId, tagId } = params;
  await api.delete(`/v0/orgs/${organizationId}/tags/${tagId}`);
};

// Flow APIs
export const createFlowApi = async (params: CreateFlowParams): Promise<Flow> => {
  const { organizationId, flow } = params;
  const response = await api.post(`/v0/orgs/${organizationId}/flows`, flow);
  return response.data;
};

export const updateFlowApi = async (params: UpdateFlowParams): Promise<Flow> => {
  const { organizationId, flowId, flow } = params;
  const response = await api.put<Flow>(`/v0/orgs/${organizationId}/flows/${flowId}`, flow);
  return response.data;
};

export const listFlowsApi = async (params: ListFlowsParams): Promise<ListFlowsResponse> => {
  const { organizationId, ...rest } = params;
  const response = await api.get(`/v0/orgs/${organizationId}/flows`, {
    params: {
      skip: rest?.skip || 0,
      limit: rest?.limit || 10
    }
  });
  return response.data;
};

export const getFlowApi = async (params: GetFlowParams): Promise<Flow> => {
  const { organizationId, flowId } = params;
  const response = await api.get<Flow>(`/v0/orgs/${organizationId}/flows/${flowId}`);
  return response.data;
};

export const deleteFlowApi = async (params: DeleteFlowParams): Promise<void> => {
  const { organizationId, flowId } = params;
  await api.delete(`/v0/orgs/${organizationId}/flows/${flowId}`);
};

// Token APIs
export const createTokenApi = async (token: CreateTokenRequest, organizationId?: string) => {
  const endpoint = organizationId 
    ? `/v0/orgs/${organizationId}/access_tokens`
    : '/v0/account/access_tokens';
  const response = await api.post(endpoint, token);
  return response.data;
};

export const getTokensApi = async (organizationId?: string) => {
  const endpoint = organizationId
    ? `/v0/orgs/${organizationId}/access_tokens`
    : '/v0/account/access_tokens';
  const response = await api.get(endpoint);
  return response.data;
};

export const deleteTokenApi = async (tokenId: string, organizationId?: string) => {
  const endpoint = organizationId
    ? `/v0/orgs/${organizationId}/access_tokens/${tokenId}`
    : `/v0/account/access_tokens/${tokenId}`;
  const response = await api.delete(endpoint);
  return response.data;
};

// AWS APIs
export const createAWSCredentialsApi = async (credentials: Omit<AWSCredentials, 'created_at'>) => {
  const response = await api.post('/v0/account/aws_credentials', credentials);
  return response.data;
};

export const getAWSCredentialsApi = async () => {
  const response = await api.get('/v0/account/aws_credentials');
  return response.data;
};

export const deleteAWSCredentialsApi = async () => {
  const response = await api.delete('/v0/account/aws_credentials');
  return response.data;
};

// Organization APIs
export const getOrganizationsApi = async (params?: { 
  userId?: string;
  organizationId?: string;
}): Promise<ListOrganizationsResponse> => {
  const queryParams = new URLSearchParams();
  if (params?.userId) queryParams.append('user_id', params.userId);
  if (params?.organizationId) queryParams.append('organization_id', params.organizationId);
  
  const response = await api.get<ListOrganizationsResponse>(
    `/v0/account/organizations?${queryParams.toString()}`
  );
  return response.data;
};

export const createOrganizationApi = async (organization: CreateOrganizationRequest): Promise<Organization> => {
  const response = await api.post('/v0/account/organizations', organization);
  const data = response.data;
  return {
    id: data._id || data.id,
    name: data.name,
    members: data.members,
    type: data.type,
    created_at: data.created_at,
    updated_at: data.updated_at
  };
};

export const getOrganizationApi = async (organizationId: string): Promise<Organization> => {
  const response = await getOrganizationsApi({ organizationId });
  return response.organizations[0]; // Will always return exactly one organization
};

export const updateOrganizationApi = async (
  organizationId: string, 
  update: UpdateOrganizationRequest
): Promise<Organization> => {
  const response = await api.put(`/v0/account/organizations/${organizationId}`, update);
  return response.data;
};

export const deleteOrganizationApi = async (organizationId: string) => {
  const response = await api.delete(`/v0/account/organizations/${organizationId}`);
  return response.data;
};

// User APIs

export const getUsersApi = async (params?: ListUsersParams): Promise<ListUsersResponse> => {
  const queryParams = new URLSearchParams();
  if (params?.skip) queryParams.append('skip', params.skip.toString());
  if (params?.limit) queryParams.append('limit', params.limit.toString());
  if (params?.organization_id) queryParams.append('organization_id', params.organization_id);
  if (params?.user_id) queryParams.append('user_id', params.user_id);

  const response = await api.get<ListUsersResponse>(
    `/v0/account/users?${queryParams.toString()}`
  );
  return response.data;
};

export const createUserApi = async (user: UserCreate): Promise<UserResponse> => {
  const response = await api.post('/v0/account/users', user);
  return response.data;
};

export const deleteUserApi = async (userId: string): Promise<void> => {
  await api.delete(`/v0/account/users/${userId}`);
};

export const getUserApi = async (userId: string): Promise<UserResponse> => {
  const response = await getUsersApi({ user_id: userId });
  return response.users[0]; // Will always return exactly one user
};

export const updateUserApi = async (userId: string, update: UserUpdate): Promise<UserResponse> => {
  const response = await api.put<UserResponse>(`/v0/account/users/${userId}`, update);
  return response.data;
};

export function getApiErrorMsg(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  
  if (isAxiosError(error)) {
    const responseData = error.response?.data as { detail?: string };
    if (responseData?.detail) {
      return responseData.detail;
    }
    if (error.message) {
      return error.message;
    }
  }

  // Fallback for unknown error types
  return 'An unexpected error occurred. Please try again.';
}

export const sendVerificationEmailApi = async (userId: string) => {
  const response = await api.post(`/v0/account/email/verification/send/${userId}`);
  return response.data;
};

export const verifyEmailApi = async (token: string) => {
  const response = await api.post(`/v0/account/email/verification/${token}`);
  return response.data;
};

export const sendRegistrationVerificationEmailApi = async (userId: string) => {
  const response = await api.post(`/v0/account/email/verification/register/${userId}`);
  return response.data;
};

// Invitation APIs
export const createInvitationApi = async (invitation: CreateInvitationRequest): Promise<InvitationResponse> => {
  const response = await api.post<InvitationResponse>('/v0/account/email/invitations', invitation);
  return response.data;
};

export const getInvitationsApi = async (params?: ListInvitationsParams): Promise<ListInvitationsResponse> => {
  const queryParams = new URLSearchParams();
  if (params?.skip) queryParams.append('skip', params.skip.toString());
  if (params?.limit) queryParams.append('limit', params.limit.toString());

  const response = await api.get<ListInvitationsResponse>(
    `/v0/account/email/invitations?${queryParams.toString()}`
  );
  return response.data;
};

export const acceptInvitationApi = async (token: string, data: AcceptInvitationRequest): Promise<{ message: string }> => {
  const response = await api.post(`/v0/account/email/invitations/${token}/accept`, data);
  return response.data;
};

export const getInvitationApi = async (token: string): Promise<InvitationResponse> => {
  const response = await api.get<InvitationResponse>(`/v0/account/email/invitations/${token}`);
  return response.data;
};

// Subscription APIs
export const getCustomerPortalApi = async (userId: string): Promise<PortalSessionResponse> => {
  const portalSessionCreate: PortalSessionCreate = {
    user_id: userId
  };
  const response = await api.post<PortalSessionResponse>(`/v0/account/payments/customer-portal`, portalSessionCreate);
  return response.data;
};

// Add these new API functions
export const getSubscriptionPlansApi = async (userId: string): Promise<SubscriptionPlanResponse> => {
  const response = await api.get<SubscriptionPlanResponse>(`/v0/account/payments/plans`, {
    params: { user_id: userId }
  });
  return response.data;
};

export const changeSubscriptionPlanApi = async (userId: string, planId: string): Promise<{ status: string; message: string }> => {
  const response = await api.post<{ status: string; message: string }>(`/v0/account/payments/change-plan`, {
    user_id: userId,
    plan_id: planId
  });
  return response.data;
};

// Add this new API function
export const getSubscriptionHistoryApi = async (userId: string): Promise<SubscriptionHistoryResponse> => {
  const response = await api.get<SubscriptionHistoryResponse>(`/v0/account/payments/subscription-history/${userId}`);
  return response.data;
};