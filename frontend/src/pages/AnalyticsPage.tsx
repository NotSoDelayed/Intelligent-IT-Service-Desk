import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  Clock,
  Ticket,
  CheckCircle2,
  PieChart as PieChartIcon
} from 'lucide-react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

import { getAnalytics } from '@/features/analytics/api';
import { MetricCard } from '@/components/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const COLORS = [
  'var(--primary)',
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#ec4899'
];

export default function AnalyticsPage() {
  const [days, setDays] = useState<string>('7');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['analytics', days],
    queryFn: () => getAnalytics(parseInt(days, 10)),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <BarChart3 className="size-6 text-muted-foreground" />
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Analytics</h1>
            <p className="text-sm text-muted-foreground">Insights and performance metrics</p>
          </div>
        </div>

        <div className="w-40">
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger>
              <SelectValue placeholder="Timeframe" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Last 24 Hours</SelectItem>
              <SelectItem value="3">Last 3 Days</SelectItem>
              <SelectItem value="7">Last 7 Days</SelectItem>
              <SelectItem value="30">Last 30 Days</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div className="h-28 rounded-xl bg-muted/50 animate-pulse" />
          <div className="h-28 rounded-xl bg-muted/50 animate-pulse" />
          <div className="h-28 rounded-xl bg-muted/50 animate-pulse" />
          <div className="h-28 rounded-xl bg-muted/50 animate-pulse" />
        </div>
      )}

      {isError && (
        <div className="flex h-32 items-center justify-center rounded-lg border border-destructive/20 bg-destructive/10 text-destructive">
          Failed to load analytics data.
        </div>
      )}

      {data && (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              title="Tickets Created"
              value={data.summary.total_created}
              icon={<Ticket className="size-4" />}
            />
            <MetricCard
              title="Tickets Resolved"
              value={data.summary.total_resolved}
              icon={<CheckCircle2 className="size-4" />}
            />
            <MetricCard
              title="Median First Response"
              value={
                data.summary.median_response_minutes !== null
                  ? `${Math.round(data.summary.median_response_minutes)} min`
                  : 'N/A'
              }
              icon={<Clock className="size-4" />}
            />
            <MetricCard
              title="Median Resolution"
              value={
                data.summary.median_resolution_minutes !== null
                  ? `${Math.round(data.summary.median_resolution_minutes)} min`
                  : 'N/A'
              }
              icon={<Clock className="size-4" />}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Created vs Resolved Chart */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="size-4" />
                  Ticket Volume
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.trend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                      <XAxis dataKey="date" stroke="var(--muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis stroke="var(--muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                      <Tooltip
                        contentStyle={{ backgroundColor: 'var(--popover)', borderColor: 'var(--border)', borderRadius: '8px' }}
                        itemStyle={{ color: 'var(--foreground)' }}
                      />
                      <Legend />
                      <Bar dataKey="created" name="Created" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="resolved" name="Resolved" fill="var(--muted-foreground)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Response Time Trend */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="size-4" />
                  Response Time Trend (mins)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data.trend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                      <XAxis dataKey="date" stroke="var(--muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis stroke="var(--muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                      <Tooltip
                        contentStyle={{ backgroundColor: 'var(--popover)', borderColor: 'var(--border)', borderRadius: '8px' }}
                        itemStyle={{ color: 'var(--foreground)' }}
                      />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="median_response"
                        name="Median Response"
                        stroke="var(--primary)"
                        strokeWidth={2}
                        dot={{ r: 4, fill: 'var(--primary)' }}
                        activeDot={{ r: 6 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Department Pie Chart */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <PieChartIcon className="size-4" />
                  Tickets by Department
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[350px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={data.departments}
                        dataKey="count"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={120}
                        innerRadius={60}
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        labelLine={true}
                      >
                        {data.departments.map((_entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ backgroundColor: 'var(--popover)', borderColor: 'var(--border)', borderRadius: '8px' }}
                        itemStyle={{ color: 'var(--foreground)' }}
                      />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
