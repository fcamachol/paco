export interface DashboardStats {
  conversations: number
  resolved: number
  resolvedPercent: number
  escalated: number
  escalatedPercent: number
  totalTokens: number
  avgResponseMs: number
  peakHour: number
}

export interface AgentStats {
  agentId: string
  conversations: number
  resolved: number
  escalated: number
  avgResponseMs: number
  accuracy: number
  tokensUsed: number
}

export interface ActivityData {
  date: string
  count: number
}

export interface HeatmapData {
  weeks: number[][] // 52 weeks x 7 days
}

export interface VolumeData {
  date: string
  label: string
  value: number
}

export interface CategoryBreakdown {
  name: string
  count: number
  percentage: number
}

export interface FunnelStage {
  name: string
  count: number
  percentage: number
}

export interface Escalation {
  id: string
  conversationId: string
  agentId: string
  reason: EscalationReason
  category: string
  resolution: EscalationResolution
  createdAt: Date
  resolvedAt?: Date
  resolvedBy?: string
}

export type EscalationReason =
  | 'user_request'
  | 'negative_sentiment'
  | 'retry_limit'
  | 'keyword_trigger'
  | 'timeout'
  | 'error'

export type EscalationResolution =
  | 'pending'
  | 'resolved_by_agent'
  | 'resolved_by_human'
  | 'transferred'
  | 'abandoned'

// Time range for queries
export type TimeRange = '24h' | '7d' | '30d' | '90d' | 'all'

export interface MetricsQuery {
  agentId?: string
  timeRange: TimeRange
  startDate?: Date
  endDate?: Date
}
