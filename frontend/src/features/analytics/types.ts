export interface AnalyticsSummary {
  total_created: number;
  total_resolved: number;
  median_response_minutes: number | null;
  median_resolution_minutes: number | null;
}

export interface AnalyticsTrend {
  date: string;
  created: number;
  resolved: number;
  median_response: number | null;
  median_resolution: number | null;
}

export interface AnalyticsDepartment {
  name: string;
  count: number;
}

export interface AnalyticsOut {
  summary: AnalyticsSummary;
  trend: AnalyticsTrend[];
  departments: AnalyticsDepartment[];
}
