import api from '@/services/api';
import type { AnalyticsOut } from './types';

export async function getAnalytics(days: number = 7) {
  const response = await api.get<AnalyticsOut>('/analytics', { params: { days } });
  return response.data;
}
