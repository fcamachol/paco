/**
 * Infrastructure types for PACO multi-agent system management
 */

export type InfrastructureType = "orchestrator" | "hive" | "company";

export interface HiveCoordinator {
  id: string;
  infrastructure_id: string;
  coordinator_model: string;
  coordinator_temperature: number;
  decomposition_prompt: string | null;
  max_concurrent_tasks: number;
  task_timeout: number;
  max_retries: number;
  aggregation_strategy: string;
  aggregation_prompt: string | null;
  plan_mode_enabled: boolean;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface HiveTask {
  id: string;
  infrastructure_id: string;
  execution_id: string | null;
  subject: string;
  description: string | null;
  active_form: string | null;
  status: "pending" | "in_progress" | "completed" | "failed" | "cancelled";
  assigned_agent_slug: string | null;
  priority: number;
  result: Record<string, any> | null;
  error_message: string | null;
  blocked_by: string[];
  blocks: string[];
  metadata: Record<string, any>;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface HiveMessage {
  id: string;
  infrastructure_id: string;
  execution_id: string | null;
  message_type: "message" | "broadcast" | "shutdown_request" | "shutdown_response";
  sender_slug: string | null;
  recipient_slug: string | null;
  content: string;
  summary: string | null;
  metadata: Record<string, any>;
  status: string;
  created_at: string;
}

export interface Infrastructure {
  id: string;
  name: string;
  display_name: string | null;
  description: string | null;
  type: InfrastructureType;
  status: "draft" | "generated" | "building" | "running" | "stopped" | "error";
  project_path: string | null;
  port_range_start: number;
  env_config: Record<string, any>;
  security_config: Record<string, any>;
  db_name: string | null;
  redis_config: Record<string, any>;
  version: string;
  agent_count: number;
  has_orchestrator: boolean;
  has_coordinator: boolean;
  has_company_config: boolean;
  created_at: string;
  updated_at: string;
}

export interface InfraOrchestrator {
  id: string;
  infrastructure_id: string;
  classification_model: string;
  classification_temperature: number;
  keyword_map: Record<string, string[]>;
  classification_prompt: string | null;
  fallback_agent: string | null;
  agent_timeout: number;
  circuit_breaker_config: Record<string, any>;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface InfraAgent {
  id: string;
  infrastructure_id: string;
  agent_id_slug: string;
  display_name: string | null;
  description: string | null;
  category_code: string;
  system_prompts: Record<string, string>;
  tools_config: any[];
  task_types: string[];
  keywords: string[];
  confidentiality_level: string;
  capabilities: Record<string, any>;
  port: number | null;
  version: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface InfraDetail extends Infrastructure {
  orchestrator: InfraOrchestrator | null;
  coordinator: HiveCoordinator | null;
  agents: InfraAgent[];
}

export interface InfraDeployment {
  id: string;
  infrastructure_id: string;
  version: string;
  status: "pending" | "building" | "deploying" | "running" | "failed" | "rolled_back" | "stopped";
  docker_compose_snapshot: string | null;
  changes_summary: string | null;
  started_at: string;
  completed_at: string | null;
  error_message: string | null;
  created_at: string;
}

export interface InfraHealthCheck {
  id: string;
  infrastructure_id: string;
  service_name: string;
  service_type: "orchestrator" | "agent" | "redis" | "postgres";
  status: "healthy" | "unhealthy" | "degraded" | "unknown";
  response_time_ms: number | null;
  circuit_state: string | null;
  details: Record<string, any>;
  checked_at: string;
}

export interface InfraMetric {
  id: string;
  infrastructure_id: string;
  agent_slug: string | null;
  period_start: string;
  period_end: string;
  total_requests: number;
  total_tokens: number;
  total_errors: number;
  avg_latency_ms: number;
  classification_accuracy: number | null;
  details: Record<string, any>;
  created_at: string;
}

export interface ServiceStatus {
  name: string;
  status: string;
  health: string;
  ports: string;
}

export interface FilePreview {
  path: string;
  content: string;
  language: string;
}

// =============================================================================
// Company Infrastructure Types
// =============================================================================

export interface CompanyConfig {
  id: string;
  infrastructure_id: string;
  heartbeat_interval_seconds: number;
  default_model: string;
  timezone: string;
  active_hours_start: string;
  active_hours_end: string;
  working_days: number[];
  heartbeat_prompt: string | null;
  status: string;
  config: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface CompanyDepartment {
  id: string;
  infrastructure_id: string;
  name: string;
  display_name: string | null;
  description: string | null;
  parent_id: string | null;
  manager_agent_slug: string | null;
  config: Record<string, any>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CompanyRole {
  id: string;
  infrastructure_id: string;
  agent_slug: string;
  department_id: string | null;
  title: string;
  role_type: string;
  reports_to_slug: string | null;
  goals: Record<string, any>;
  working_hours: Record<string, any>;
  checklist_md: string | null;
  is_active: boolean;
  hired_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CompanySchedule {
  id: string;
  infrastructure_id: string;
  agent_slug: string;
  name: string;
  schedule_type: "heartbeat" | "cron" | "interval";
  cron_expression: string | null;
  interval_seconds: number | null;
  checklist_md: string | null;
  prompt_template: string | null;
  active_hours_start: string | null;
  active_hours_end: string | null;
  timezone: string | null;
  is_enabled: boolean;
  last_triggered_at: string | null;
  next_trigger_at: string | null;
  config: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface CompanyTask {
  id: string;
  infrastructure_id: string;
  schedule_id: string | null;
  agent_slug: string;
  title: string;
  description: string | null;
  task_type: "heartbeat_check" | "scheduled_job" | "ad_hoc";
  status: "pending" | "in_progress" | "completed" | "failed" | "heartbeat_ok" | "skipped";
  priority: number;
  input_data: Record<string, any>;
  result: Record<string, any> | null;
  error_message: string | null;
  cost_usd: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  langfuse_trace_id: string | null;
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  created_at: string;
}

export interface CompanyWorkLog {
  id: string;
  infrastructure_id: string;
  agent_slug: string;
  log_date: string;
  summary: string | null;
  entries: Array<Record<string, any>>;
  memory_notes: string | null;
  tasks_completed: number;
  tasks_failed: number;
  total_cost_usd: number | null;
  total_tokens: number | null;
  created_at: string;
  updated_at: string;
}

export interface CompanyMessage {
  id: string;
  infrastructure_id: string;
  sender_slug: string;
  recipient_slug: string | null;
  department_id: string | null;
  message_type: "direct" | "broadcast" | "task_request" | "task_result" | "escalation";
  subject: string | null;
  content: string;
  metadata: Record<string, any>;
  status: "sent" | "delivered" | "read" | "archived";
  parent_message_id: string | null;
  created_at: string;
  read_at: string | null;
}

export interface CompanyOverview {
  status: string;
  active_agents: number;
  total_agents: number;
  tasks_today: number;
  heartbeat_ok_today: number;
  tasks_failed_today: number;
  total_cost_today: number | null;
  schedules_active: number;
  schedules_total: number;
}
