export interface JwtPayload {
  sub: string;
  tenantId: string;
  role: string;
  email: string;
  /** Only set on refresh tokens — the Redis key suffix used to revoke/rotate them. */
  jti?: string;
  iat?: number;
  exp?: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  errors?: string[];
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: PaginationMeta;
}

export interface KafkaEvent<T> {
  eventId: string;
  eventType: string;
  tenantId: string;
  timestamp: string;
  data: T;
}

export interface ConversationHistoryItem {
  role: string;
  content: string;
  timestamp: string;
}

export interface WhatsAppSession {
  sessionId: string;
  tenantId: string;
  phone: string;
  patientId?: string;
  fsmState: string;
  fsmContext: Record<string, unknown>;
  preferredLanguage: string;
  conversationHistory: ConversationHistoryItem[];
  lastActivityAt: string;
}
