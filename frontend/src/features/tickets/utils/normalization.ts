import type { TicketCategory, TicketPriority, TicketStatus } from '@/types/ticket';
import type {
  TicketBackendCategory,
  TicketBackendPriority,
  TicketBackendStatus,
} from '../types';

export function toUiStatus(status: TicketBackendStatus | string | null | undefined): TicketStatus {
  switch (status) {
    case 'In Progress':
      return 'in_progress';
    case 'Pending User':
      return 'pending_user';
    case 'Resolved':
      return 'resolved';
    case 'Closed':
      return 'closed';
    case 'Open':
    default:
      return 'open';
  }
}

export function toBackendStatus(status: TicketStatus): TicketBackendStatus {
  switch (status) {
    case 'in_progress':
      return 'In Progress';
    case 'pending_user':
      return 'Pending User';
    case 'resolved':
      return 'Resolved';
    case 'closed':
      return 'Closed';
    case 'open':
    default:
      return 'Open';
  }
}

export function toUiPriority(
  priority: TicketBackendPriority | string | null | undefined
): TicketPriority {
  switch (priority) {
    case 'P1':
      return 'critical';
    case 'P2':
      return 'high';
    case 'P4':
      return 'low';
    case 'P3':
    default:
      return 'medium';
  }
}

export function toUiCategory(
  category: TicketBackendCategory | string | null | undefined
): TicketCategory {
  switch (category) {
    case 'Hardware':
      return 'hardware';
    case 'Software':
      return 'software';
    case 'Network':
      return 'network';
    case 'Security':
      return 'security';
    case 'Access/Account':
      return 'access';
    case 'Email':
      return 'email';
    case 'Other':
    default:
      return 'other';
  }
}

export function formatBackendCategory(category: string | null | undefined) {
  return category ?? 'Unknown';
}

export function toBackendPriority(priority: TicketPriority): TicketBackendPriority {
  switch (priority) {
    case 'critical':
      return 'P1';
    case 'high':
      return 'P2';
    case 'low':
      return 'P4';
    case 'medium':
    default:
      return 'P3';
  }
}

export function toBackendCategory(category: TicketCategory): TicketBackendCategory {
  switch (category) {
    case 'hardware':
      return 'Hardware';
    case 'software':
      return 'Software';
    case 'network':
      return 'Network';
    case 'security':
      return 'Security';
    case 'access':
      return 'Access/Account';
    case 'email':
      return 'Email';
    case 'other':
    default:
      return 'Other';
  }
}
