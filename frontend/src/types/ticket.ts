/** Ticket priority levels */
export type TicketPriority = 'low' | 'medium' | 'high' | 'critical';

/** Ticket status lifecycle */
export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';

/** Support ticket categories */
export type TicketCategory =
  | 'hardware'
  | 'software'
  | 'network'
  | 'security'
  | 'access'
  | 'email'
  | 'other';

/** Core ticket model */
export interface Ticket {
  id: string;
  subject: string;
  description: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  createdAt: string;
  updatedAt: string;
  /** AI-suggested category */
  suggestedCategory: TicketCategory | null;
  /** AI-suggested priority */
  suggestedPriority: TicketPriority | null;
  /** AI confidence score (0–1) */
  aiConfidence: number | null;
}

/** Paginated API response */
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
