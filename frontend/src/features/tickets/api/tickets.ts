import api from '@/services/api';
import type {
  TicketComment,
  TicketCommentCreatePayload,
  TicketCreatePayload,
  TicketDetailDto,
  TicketListParams,
  TicketPageDto,
  TicketUpdateAdminPayload,
} from '../types';

export async function createTicket(payload: TicketCreatePayload) {
  const response = await api.post<TicketDetailDto>('/tickets', payload);
  return response.data;
}

export async function listTickets(params?: TicketListParams) {
  const response = await api.get<TicketPageDto>('/tickets', { params });
  return response.data;
}

export async function getTicket(ticketNo: string) {
  const response = await api.get<TicketDetailDto>(`/tickets/${ticketNo}`);
  return response.data;
}

export async function updateTicket(ticketNo: string, payload: TicketUpdateAdminPayload) {
  const response = await api.patch<TicketDetailDto>(`/tickets/${ticketNo}`, payload);
  return response.data;
}

export async function updateTicketStatus(
  ticketNo: string,
  status: NonNullable<TicketUpdateAdminPayload['status']>
) {
  return updateTicket(ticketNo, { status });
}

export async function deleteTicket(ticketNo: string) {
  await api.delete(`/tickets/${ticketNo}`);
}

export async function reanalyzeTicket(ticketNo: string) {
  const response = await api.post<TicketDetailDto>(`/tickets/${ticketNo}/analyze`);
  return response.data;
}

export async function escalateTicket(ticketNo: string, username: string) {
  const response = await api.post<TicketDetailDto>(`/tickets/${ticketNo}/escalate`, { username });
  return response.data;
}

export async function getTicketComments(ticketNo: string) {
  const response = await api.get<TicketComment[]>(`/tickets/${ticketNo}/comments`);
  return response.data;
}

export async function addTicketComment(ticketNo: string, payload: TicketCommentCreatePayload) {
  const response = await api.post<TicketComment>(`/tickets/${ticketNo}/comments`, payload);
  return response.data;
}
