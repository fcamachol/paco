/**
 * PACO Telemetry Module
 *
 * Provides OpenTelemetry + Langfuse instrumentation for PACO agents.
 * This module should be imported at the entry point of each agent.
 */

import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { Resource } from "@opentelemetry/resources";
import {
  SEMRESATTRS_SERVICE_NAME,
  SEMRESATTRS_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";
import { trace, context, SpanKind, SpanStatusCode } from "@opentelemetry/api";
import { Langfuse } from "langfuse";

// =============================================================================
// Configuration
// =============================================================================

export interface TelemetryConfig {
  serviceName: string;
  serviceVersion?: string;
  enabled?: boolean;
  langfuse?: {
    enabled?: boolean;
    publicKey?: string;
    secretKey?: string;
    baseUrl?: string;
  };
  otel?: {
    enabled?: boolean;
    endpoint?: string;
  };
}

// =============================================================================
// Global State
// =============================================================================

let sdk: NodeSDK | null = null;
let langfuseClient: Langfuse | null = null;
let currentConfig: TelemetryConfig | null = null;

// =============================================================================
// Initialization
// =============================================================================

/**
 * Initialize telemetry for an agent.
 * Call this at the entry point of your agent.
 */
export async function initTelemetry(config: TelemetryConfig): Promise<void> {
  if (config.enabled === false) {
    console.log("[Telemetry] Disabled by configuration");
    return;
  }

  currentConfig = config;

  // Initialize OpenTelemetry
  if (config.otel?.enabled !== false) {
    const otlpEndpoint =
      config.otel?.endpoint ||
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT ||
      "http://localhost:4318";

    const traceExporter = new OTLPTraceExporter({
      url: `${otlpEndpoint}/v1/traces`,
    });

    sdk = new NodeSDK({
      resource: new Resource({
        [SEMRESATTRS_SERVICE_NAME]: config.serviceName,
        [SEMRESATTRS_SERVICE_VERSION]: config.serviceVersion || "1.0.0",
      }),
      traceExporter,
      instrumentations: [
        getNodeAutoInstrumentations({
          "@opentelemetry/instrumentation-fs": { enabled: false },
        }),
      ],
    });

    await sdk.start();
    console.log(`[Telemetry] OpenTelemetry initialized for ${config.serviceName}`);
  }

  // Initialize Langfuse
  if (config.langfuse?.enabled !== false) {
    const publicKey =
      config.langfuse?.publicKey || process.env.LANGFUSE_PUBLIC_KEY;
    const secretKey =
      config.langfuse?.secretKey || process.env.LANGFUSE_SECRET_KEY;
    const baseUrl =
      config.langfuse?.baseUrl ||
      process.env.LANGFUSE_HOST ||
      "http://localhost:3001";

    if (publicKey && secretKey) {
      langfuseClient = new Langfuse({
        publicKey,
        secretKey,
        baseUrl,
      });
      console.log(`[Telemetry] Langfuse initialized for ${config.serviceName}`);
    } else {
      console.log("[Telemetry] Langfuse not configured (missing keys)");
    }
  }
}

/**
 * Shutdown telemetry gracefully.
 * Call this when your agent is shutting down.
 */
export async function shutdownTelemetry(): Promise<void> {
  if (sdk) {
    await sdk.shutdown();
    console.log("[Telemetry] OpenTelemetry shutdown complete");
  }

  if (langfuseClient) {
    await langfuseClient.shutdownAsync();
    console.log("[Telemetry] Langfuse shutdown complete");
  }
}

// =============================================================================
// Tracing Utilities
// =============================================================================

/**
 * Get the OpenTelemetry tracer for the current service.
 */
export function getTracer() {
  return trace.getTracer(currentConfig?.serviceName || "unknown");
}

/**
 * Create a new span for tracing.
 */
export async function withSpan<T>(
  name: string,
  fn: () => Promise<T>,
  options?: {
    kind?: SpanKind;
    attributes?: Record<string, string | number | boolean>;
  }
): Promise<T> {
  const tracer = getTracer();
  const span = tracer.startSpan(name, {
    kind: options?.kind || SpanKind.INTERNAL,
    attributes: options?.attributes,
  });

  try {
    const result = await context.with(
      trace.setSpan(context.active(), span),
      fn
    );
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error instanceof Error ? error.message : "Unknown error",
    });
    throw error;
  } finally {
    span.end();
  }
}

// =============================================================================
// Langfuse Integration
// =============================================================================

/**
 * Get the Langfuse client for logging.
 */
export function getLangfuse(): Langfuse | null {
  return langfuseClient;
}

/**
 * Create a Langfuse trace for an agent execution.
 */
export function createTrace(options: {
  name: string;
  userId?: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;
  input?: unknown;
}) {
  if (!langfuseClient) {
    return null;
  }

  return langfuseClient.trace({
    name: options.name,
    userId: options.userId,
    sessionId: options.sessionId,
    metadata: options.metadata,
    input: options.input,
  });
}

/**
 * Track an LLM generation (Claude API call).
 */
export function trackGeneration(
  trace: ReturnType<typeof createTrace>,
  options: {
    name: string;
    model: string;
    input?: unknown;
    output?: unknown;
    inputTokens?: number;
    outputTokens?: number;
    startTime?: Date;
    endTime?: Date;
    metadata?: Record<string, unknown>;
  }
) {
  if (!trace) {
    return null;
  }

  return trace.generation({
    name: options.name,
    model: options.model,
    input: options.input,
    output: options.output,
    usage: {
      input: options.inputTokens,
      output: options.outputTokens,
    },
    startTime: options.startTime,
    endTime: options.endTime,
    metadata: options.metadata,
  });
}

/**
 * Track a tool call.
 */
export function trackToolCall(
  trace: ReturnType<typeof createTrace>,
  options: {
    name: string;
    input?: unknown;
    output?: unknown;
    startTime?: Date;
    endTime?: Date;
    metadata?: Record<string, unknown>;
  }
) {
  if (!trace) {
    return null;
  }

  return trace.span({
    name: `tool:${options.name}`,
    input: options.input,
    output: options.output,
    startTime: options.startTime,
    endTime: options.endTime,
    metadata: options.metadata,
  });
}

// =============================================================================
// Token Tracking
// =============================================================================

// Pricing per 1K tokens (as of 2024)
const PRICING = {
  "claude-3-opus-20240229": { input: 0.015, output: 0.075 },
  "claude-3-sonnet-20240229": { input: 0.003, output: 0.015 },
  "claude-3-haiku-20240307": { input: 0.00025, output: 0.00125 },
  "claude-sonnet-4-20250514": { input: 0.003, output: 0.015 },
  "claude-3-5-sonnet-20241022": { input: 0.003, output: 0.015 },
  default: { input: 0.003, output: 0.015 },
};

/**
 * Calculate cost for a given model and token usage.
 */
export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const pricing =
    PRICING[model as keyof typeof PRICING] || PRICING.default;
  const inputCost = (inputTokens / 1000) * pricing.input;
  const outputCost = (outputTokens / 1000) * pricing.output;
  return inputCost + outputCost;
}

// =============================================================================
// Express Middleware
// =============================================================================

/**
 * Express middleware for request tracing.
 */
export function telemetryMiddleware() {
  return (req: any, res: any, next: any) => {
    const tracer = getTracer();
    const span = tracer.startSpan(`HTTP ${req.method} ${req.path}`, {
      kind: SpanKind.SERVER,
      attributes: {
        "http.method": req.method,
        "http.url": req.url,
        "http.route": req.path,
      },
    });

    // Add trace ID to response headers
    const traceId = span.spanContext().traceId;
    res.setHeader("X-Trace-ID", traceId);

    // Store span in request for later use
    req.telemetrySpan = span;

    // Track response
    res.on("finish", () => {
      span.setAttribute("http.status_code", res.statusCode);
      if (res.statusCode >= 400) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: `HTTP ${res.statusCode}`,
        });
      } else {
        span.setStatus({ code: SpanStatusCode.OK });
      }
      span.end();
    });

    context.with(trace.setSpan(context.active(), span), () => {
      next();
    });
  };
}

// =============================================================================
// Export Types
// =============================================================================

export type { Langfuse };
