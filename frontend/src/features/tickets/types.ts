export type TicketBackendStatus = 'Open' | 'In Progress' | 'Pending User' | 'Resolved' | 'Closed';
export type TicketBackendSeverity = 'Low' | 'Medium' | 'High' | 'Urgent';
export type TicketBackendPriority = 'P1' | 'P2' | 'P3' | 'P4';
export type TicketBackendDifficulty = 'Easy' | 'Medium' | 'Hard';
export type TicketBackendCategory =
  | 'Network'
  | 'Hardware'
  | 'Software'
  | 'Access/Account'
  | 'Email'
  | 'Security'
  | 'Other';

export type TicketSort = 'queue' | 'newest';

export interface TicketCreatePayload {
  name: string;
  title: string;
  content: string;
  user_priority?: number;
}

export interface TicketUpdateAdminPayload {
  status?: TicketBackendStatus;
  severity?: TicketBackendSeverity;
  assigned_engineer?: string | null;
  category?: TicketBackendCategory;
  priority?: TicketBackendPriority;
  difficulty?: TicketBackendDifficulty;
  assigned_team?: string;
}

export interface TicketListParams {
  status?: TicketBackendStatus;
  severity?: TicketBackendSeverity;
  category?: TicketBackendCategory;
  priority?: TicketBackendPriority;
  assigned_team?: string;
  sort?: TicketSort;
  search?: string;
  page?: number;
  limit?: number;
  author_username?: string;
}

export interface TicketCommentCreatePayload {
  message: string;
}

export interface TicketComment {
  id: number;
  author_name: string;
  message: string;
  is_system: number;
  created_at: string;
}

export interface TicketListItemDto {
  ticket_no: string;
  title: string;
  status: TicketBackendStatus;
  severity: TicketBackendSeverity;
  category: TicketBackendCategory | null;
  priority: TicketBackendPriority | null;
  difficulty: TicketBackendDifficulty | null;
  assigned_team: string | null;
  assigned_engineer: string | null;
  author: string;
  age: number;
  created_on: string;
  due_by: string | null;
  sla_status: string | null;
  user_priority: number | null;
  ai_confidence_level?: string | null;
}

export interface TicketPageDto {
  tickets: TicketListItemDto[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

export interface TicketDetailDto {
  id: number;
  ticket_no: string;
  title: string;
  content: string;
  status: TicketBackendStatus;
  author: string;
  age: number;
  created_on: string;
  ticket_start_date: string | null;
  ticket_closed_date: string | null;
  severity: TicketBackendSeverity;
  assigned_engineer: string | null;
  closed_ticket: string | null;
  user_priority: number | null;
  category: TicketBackendCategory | null;
  priority: TicketBackendPriority | null;
  difficulty: TicketBackendDifficulty | null;
  assigned_team: string | null;
  ai_recommended_steps: string[] | null;
  ai_confidence: number | null;
  ai_confidence_level: string | null;
  ai_confidence_reason: string | null;
  ai_summary: string | null;
  user_self_help_steps: string[] | null;
  self_help_note: string | null;
  is_self_service: boolean;
  sla_minutes: number | null;
  due_by: string | null;
  sla_status: string | null;
  duplicate_warning: string | null;
  duplicate_ticket_no: string | null;
}
