-- =============================================================================
-- PACO Agent Hub - Database Initialization Script
-- =============================================================================
-- This script creates separate databases for PACO and Langfuse

-- Create Langfuse database
CREATE DATABASE langfuse;

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE langfuse TO paco;
GRANT ALL PRIVILEGES ON DATABASE paco TO paco;

-- Connect to PACO database and create schema
\c paco;

-- =============================================================================
-- Extensions
-- =============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- Users & Authentication
-- =============================================================================
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'operator', 'viewer')),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP WITH TIME ZONE
);

-- Create default admin user (password: admin123 - CHANGE THIS!)
INSERT INTO users (email, password_hash, name, role) VALUES (
    'admin@paco.local',
    '$2b$12$577UnPfvtq8YnCksCeuHw.CZbGrduvCUo.Y.bT/UxKVaxS61Nw3/q',
    'PACO Admin',
    'admin'
);

-- =============================================================================
-- MCP Server Registry
-- =============================================================================
CREATE TABLE mcp_servers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) UNIQUE NOT NULL,
    description TEXT,
    transport VARCHAR(50) NOT NULL DEFAULT 'stdio' CHECK (transport IN ('stdio', 'http', 'websocket')),
    url VARCHAR(500),
    proxy_url VARCHAR(500),
    command TEXT,
    args JSONB DEFAULT '[]',
    env JSONB DEFAULT '{}',
    auth_config JSONB DEFAULT '{}',
    status VARCHAR(50) DEFAULT 'unknown' CHECK (status IN ('online', 'offline', 'error', 'unknown')),
    last_health_check TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- Tool Registry
-- =============================================================================
CREATE TABLE tools (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    mcp_server_id UUID REFERENCES mcp_servers(id) ON DELETE CASCADE,
    input_schema JSONB NOT NULL DEFAULT '{}',
    output_schema JSONB DEFAULT '{}',
    is_enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(name, mcp_server_id)
);

-- =============================================================================
-- Agent Registry (SDK-aligned)
-- =============================================================================
CREATE TABLE agents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) UNIQUE NOT NULL,
    display_name VARCHAR(255),
    description TEXT,
    status VARCHAR(50) DEFAULT 'stopped' CHECK (status IN ('running', 'stopped', 'error', 'starting', 'stopping')),
    pm2_name VARCHAR(255),
    port INTEGER,
    project_path TEXT,
    health_endpoint VARCHAR(255) DEFAULT '/health',
    last_health_check TIMESTAMP WITH TIME ZONE,
    -- ClaudeAgentOptions fields
    model VARCHAR(255) DEFAULT 'claude-sonnet-4-5-20250929',
    system_prompt TEXT,
    permission_mode VARCHAR(50) DEFAULT 'default',
    max_turns INTEGER,
    max_budget_usd DECIMAL(10,2),
    max_thinking_tokens INTEGER,
    sdk_config JSONB DEFAULT '{}',
    env_vars JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- Agent-Tool Associations
-- =============================================================================
CREATE TABLE agent_tools (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    tool_id UUID NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
    is_required BOOLEAN DEFAULT true,
    config_overrides JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_agent_tool UNIQUE (agent_id, tool_id)
);

-- =============================================================================
-- Skills Registry (DB is index only — content lives in SKILL.md on filesystem)
-- =============================================================================
CREATE TABLE skills (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    skill_path TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- Agent-Skill Associations (simplified — just enable/disable)
-- =============================================================================
CREATE TABLE agent_skills (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    is_enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_agent_skill UNIQUE (agent_id, skill_id)
);

-- =============================================================================
-- Execution Logs (Token Tracking)
-- =============================================================================
CREATE TABLE executions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
    conversation_id VARCHAR(255),
    trace_id VARCHAR(255),
    langfuse_trace_id VARCHAR(255),
    user_id VARCHAR(255),
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP WITH TIME ZONE,
    duration_ms INTEGER,
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    total_tokens INTEGER GENERATED ALWAYS AS (input_tokens + output_tokens) STORED,
    total_cost DECIMAL(10, 6) DEFAULT 0,
    model VARCHAR(255),
    status VARCHAR(50) DEFAULT 'running' CHECK (status IN ('running', 'success', 'error', 'timeout')),
    error_message TEXT,
    metadata JSONB DEFAULT '{}'
);

-- =============================================================================
-- Tool Call Logs
-- =============================================================================
CREATE TABLE tool_calls (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    execution_id UUID REFERENCES executions(id) ON DELETE CASCADE,
    tool_id UUID REFERENCES tools(id) ON DELETE SET NULL,
    tool_name VARCHAR(255) NOT NULL,
    input JSONB DEFAULT '{}',
    output JSONB,
    latency_ms INTEGER,
    success BOOLEAN DEFAULT true,
    error_message TEXT,
    called_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- Flow Definitions
-- =============================================================================
CREATE TABLE flows (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) UNIQUE NOT NULL,
    description TEXT,
    config_yaml TEXT NOT NULL,
    is_enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- =============================================================================
-- Flow Executions
-- =============================================================================
CREATE TABLE flow_executions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    flow_id UUID REFERENCES flows(id) ON DELETE SET NULL,
    trigger_type VARCHAR(100),
    trigger_data JSONB DEFAULT '{}',
    status VARCHAR(50) DEFAULT 'running' CHECK (status IN ('running', 'success', 'error', 'timeout')),
    current_step VARCHAR(255),
    state JSONB DEFAULT '{}',
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT
);

-- =============================================================================
-- API Keys (for programmatic access)
-- =============================================================================
CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    key_hash VARCHAR(255) NOT NULL,
    prefix VARCHAR(10) NOT NULL,
    permissions JSONB DEFAULT '["read"]',
    expires_at TIMESTAMP WITH TIME ZONE,
    last_used_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT true
);

-- =============================================================================
-- Indexes for Performance
-- =============================================================================
CREATE INDEX idx_executions_agent_id ON executions(agent_id);
CREATE INDEX idx_executions_started_at ON executions(started_at DESC);
CREATE INDEX idx_executions_conversation_id ON executions(conversation_id);
CREATE INDEX idx_executions_trace_id ON executions(trace_id);
CREATE INDEX idx_tool_calls_execution_id ON tool_calls(execution_id);
CREATE INDEX idx_tool_calls_called_at ON tool_calls(called_at DESC);
CREATE INDEX idx_agents_status ON agents(status);
CREATE INDEX idx_users_email ON users(email);

-- =============================================================================
-- Updated At Trigger Function
-- =============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply triggers
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_agents_updated_at
    BEFORE UPDATE ON agents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tools_updated_at
    BEFORE UPDATE ON tools
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_mcp_servers_updated_at
    BEFORE UPDATE ON mcp_servers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_flows_updated_at
    BEFORE UPDATE ON flows
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- Helpful Views
-- =============================================================================

-- Token usage summary by agent (daily)
CREATE VIEW daily_token_usage AS
SELECT
    a.name as agent_name,
    DATE(e.started_at) as date,
    COUNT(*) as execution_count,
    SUM(e.input_tokens) as total_input_tokens,
    SUM(e.output_tokens) as total_output_tokens,
    SUM(e.total_tokens) as total_tokens,
    SUM(e.total_cost) as total_cost
FROM executions e
LEFT JOIN agents a ON e.agent_id = a.id
GROUP BY a.name, DATE(e.started_at)
ORDER BY date DESC, agent_name;

-- Tool usage statistics
CREATE VIEW tool_usage_stats AS
SELECT
    tc.tool_name,
    COUNT(*) as call_count,
    AVG(tc.latency_ms) as avg_latency_ms,
    SUM(CASE WHEN tc.success THEN 1 ELSE 0 END)::FLOAT / COUNT(*) * 100 as success_rate
FROM tool_calls tc
GROUP BY tc.tool_name
ORDER BY call_count DESC;

-- =============================================================================
-- Infrastructures (Multi-Agent Systems)
-- =============================================================================
CREATE TABLE infrastructures (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) UNIQUE NOT NULL,
    display_name VARCHAR(255),
    description TEXT,
    status VARCHAR(50) DEFAULT 'draft' CHECK (status IN ('draft', 'generated', 'building', 'running', 'stopped', 'error')),
    project_path TEXT,
    port_range_start INTEGER DEFAULT 8000,
    env_config JSONB DEFAULT '{}',
    security_config JSONB DEFAULT '{}',
    db_name VARCHAR(255),
    redis_config JSONB DEFAULT '{}',
    version VARCHAR(50) DEFAULT '1.0.0',
    type VARCHAR(50) DEFAULT 'orchestrator',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE infra_orchestrators (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    infrastructure_id UUID NOT NULL REFERENCES infrastructures(id) ON DELETE CASCADE,
    classification_model VARCHAR(255) DEFAULT 'claude-sonnet-4-5-20250929',
    classification_temperature FLOAT DEFAULT 0.1,
    keyword_map JSONB DEFAULT '{}',
    classification_prompt TEXT,
    fallback_agent VARCHAR(255),
    agent_timeout FLOAT DEFAULT 30.0,
    circuit_breaker_config JSONB DEFAULT '{"failure_threshold": 5, "recovery_timeout": 30, "half_open_max_calls": 3}',
    status VARCHAR(50) DEFAULT 'stopped',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(infrastructure_id)
);

CREATE TABLE infra_agents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    infrastructure_id UUID NOT NULL REFERENCES infrastructures(id) ON DELETE CASCADE,
    agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
    role VARCHAR(50) DEFAULT 'primary',
    port_override INTEGER,
    env_overrides JSONB DEFAULT '{}',
    agent_id_slug VARCHAR(255) NOT NULL,
    display_name VARCHAR(255),
    description TEXT,
    category_code VARCHAR(50) NOT NULL,
    system_prompts JSONB DEFAULT '{}',
    tools_config JSONB DEFAULT '[]',
    task_types JSONB DEFAULT '["general_inquiry"]',
    keywords JSONB DEFAULT '[]',
    confidentiality_level VARCHAR(50) DEFAULT 'INTERNAL',
    capabilities JSONB DEFAULT '{}',
    port INTEGER,
    version VARCHAR(50) DEFAULT '1.0.0',
    status VARCHAR(50) DEFAULT 'stopped',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(infrastructure_id, agent_id_slug),
    UNIQUE(infrastructure_id, category_code)
);

CREATE TABLE infra_deployments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    infrastructure_id UUID NOT NULL REFERENCES infrastructures(id) ON DELETE CASCADE,
    version VARCHAR(50) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'building', 'deploying', 'running', 'failed', 'rolled_back', 'stopped')),
    docker_compose_snapshot TEXT,
    changes_summary TEXT,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE infra_health_checks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    infrastructure_id UUID NOT NULL REFERENCES infrastructures(id) ON DELETE CASCADE,
    service_name VARCHAR(255) NOT NULL,
    service_type VARCHAR(50) NOT NULL CHECK (service_type IN ('orchestrator', 'agent', 'redis', 'postgres')),
    status VARCHAR(50) NOT NULL CHECK (status IN ('healthy', 'unhealthy', 'degraded', 'unknown')),
    response_time_ms INTEGER,
    circuit_state VARCHAR(50),
    details JSONB DEFAULT '{}',
    checked_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE infra_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    infrastructure_id UUID NOT NULL REFERENCES infrastructures(id) ON DELETE CASCADE,
    agent_slug VARCHAR(255),
    period_start TIMESTAMP WITH TIME ZONE NOT NULL,
    period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    total_requests INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,
    total_errors INTEGER DEFAULT 0,
    avg_latency_ms FLOAT DEFAULT 0,
    classification_accuracy FLOAT,
    details JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- Hive Infrastructure Tables
-- =============================================================================
CREATE TABLE hive_coordinators (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    infrastructure_id UUID NOT NULL REFERENCES infrastructures(id) ON DELETE CASCADE,
    coordinator_model VARCHAR(255) DEFAULT 'claude-sonnet-4-5-20250929',
    coordinator_temperature FLOAT DEFAULT 0.1,
    decomposition_prompt TEXT,
    max_concurrent_tasks INTEGER DEFAULT 5,
    task_timeout INTEGER DEFAULT 300,
    max_retries INTEGER DEFAULT 2,
    aggregation_strategy VARCHAR(50) DEFAULT 'merge',
    aggregation_prompt TEXT,
    plan_mode_enabled BOOLEAN DEFAULT true,
    status VARCHAR(50) DEFAULT 'stopped',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(infrastructure_id)
);

CREATE TABLE hive_tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    infrastructure_id UUID NOT NULL REFERENCES infrastructures(id) ON DELETE CASCADE,
    execution_id VARCHAR(255),
    subject VARCHAR(500) NOT NULL,
    description TEXT,
    active_form VARCHAR(500),
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'failed', 'cancelled')),
    assigned_agent_slug VARCHAR(255),
    priority INTEGER DEFAULT 0,
    result JSONB,
    error_message TEXT,
    blocked_by JSONB DEFAULT '[]',
    blocks JSONB DEFAULT '[]',
    metadata JSONB DEFAULT '{}',
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE hive_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    infrastructure_id UUID NOT NULL REFERENCES infrastructures(id) ON DELETE CASCADE,
    execution_id VARCHAR(255),
    message_type VARCHAR(50) DEFAULT 'message' CHECK (message_type IN ('message', 'broadcast', 'shutdown_request', 'shutdown_response')),
    sender_slug VARCHAR(255),
    recipient_slug VARCHAR(255),
    content TEXT NOT NULL,
    summary VARCHAR(500),
    metadata JSONB DEFAULT '{}',
    status VARCHAR(50) DEFAULT 'sent',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Skills and Agent-Skills indexes
CREATE INDEX idx_skills_code ON skills(code);
CREATE INDEX idx_agent_skills_agent ON agent_skills(agent_id);
CREATE INDEX idx_agent_skills_skill ON agent_skills(skill_id);
CREATE INDEX idx_agent_tools_agent ON agent_tools(agent_id);
CREATE INDEX idx_agent_tools_tool ON agent_tools(tool_id);

-- Infrastructure indexes
CREATE INDEX idx_infrastructures_status ON infrastructures(status);
CREATE INDEX idx_infra_agents_infrastructure ON infra_agents(infrastructure_id);
CREATE INDEX idx_infra_deployments_infrastructure ON infra_deployments(infrastructure_id);
CREATE INDEX idx_infra_deployments_status ON infra_deployments(status);
CREATE INDEX idx_infra_health_checks_infrastructure ON infra_health_checks(infrastructure_id);
CREATE INDEX idx_infra_health_checks_checked_at ON infra_health_checks(checked_at DESC);
CREATE INDEX idx_infra_metrics_infrastructure ON infra_metrics(infrastructure_id);
CREATE INDEX idx_infra_metrics_period ON infra_metrics(period_start DESC);

-- Hive indexes
CREATE INDEX idx_hive_tasks_infrastructure ON hive_tasks(infrastructure_id);
CREATE INDEX idx_hive_tasks_execution ON hive_tasks(execution_id);
CREATE INDEX idx_hive_tasks_status ON hive_tasks(status);
CREATE INDEX idx_hive_tasks_assigned ON hive_tasks(assigned_agent_slug);
CREATE INDEX idx_hive_messages_infrastructure ON hive_messages(infrastructure_id);
CREATE INDEX idx_hive_messages_execution ON hive_messages(execution_id);

-- Skills trigger
CREATE TRIGGER update_skills_updated_at
    BEFORE UPDATE ON skills
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Infrastructure triggers
CREATE TRIGGER update_infrastructures_updated_at
    BEFORE UPDATE ON infrastructures
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_infra_orchestrators_updated_at
    BEFORE UPDATE ON infra_orchestrators
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_infra_agents_updated_at
    BEFORE UPDATE ON infra_agents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_hive_coordinators_updated_at
    BEFORE UPDATE ON hive_coordinators
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Agent health summary
CREATE VIEW agent_health AS
SELECT
    a.id,
    a.name,
    a.display_name,
    a.status,
    a.port,
    a.last_health_check,
    COUNT(e.id) FILTER (WHERE e.started_at > NOW() - INTERVAL '1 hour') as executions_last_hour,
    COUNT(e.id) FILTER (WHERE e.status = 'error' AND e.started_at > NOW() - INTERVAL '1 hour') as errors_last_hour
FROM agents a
LEFT JOIN executions e ON a.id = e.agent_id
GROUP BY a.id, a.name, a.display_name, a.status, a.port, a.last_health_check;
