-- Migration: Add proxy_url column to mcp_servers table
-- Date: 2026-02-06
-- Description: Allows per-MCP-server proxy configuration for tools
--              that need to route requests through a proxy (e.g. CEA SOAP APIs).

ALTER TABLE mcp_servers ADD COLUMN IF NOT EXISTS proxy_url VARCHAR(500);
