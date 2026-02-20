// paco/mcp-servers/shared/proxy-config.ts

import { ProxyAgent, type Dispatcher } from "undici";

export interface ProxyConfig {
  enabled: boolean;
  protocol: "http" | "https" | "socks5";
  url: string;
  auth?: { username: string; password: string };
  bypass_patterns?: string[];
}

export interface ServerProxyConfig {
  server: ProxyConfig | null;
  tools: Record<string, ProxyConfig | null>;
}

export class ProxyConfigManager {
  private config: ServerProxyConfig = { server: null, tools: {} };
  private backendUrl: string;
  private serverName: string;

  constructor(serverName: string, backendUrl?: string) {
    this.serverName = serverName;
    this.backendUrl = backendUrl || process.env.PACO_BACKEND_URL || "http://paco-backend:8000";
  }

  /**
   * Fetch proxy config from the PACO backend.
   * Falls back to CEA_PROXY_URL env var if backend is unreachable.
   */
  async initialize(): Promise<void> {
    try {
      await this.fetchConfig();
      console.log(`[ProxyConfig] Loaded config from backend for ${this.serverName}`);
    } catch (err) {
      console.warn(`[ProxyConfig] Could not fetch from backend, checking env fallback: ${err}`);
      // Fallback to legacy env var
      const legacyUrl = process.env.CEA_PROXY_URL || null;
      if (legacyUrl) {
        this.config = {
          server: { enabled: true, protocol: "http", url: legacyUrl },
          tools: {},
        };
        console.log(`[ProxyConfig] Using legacy CEA_PROXY_URL: ${legacyUrl}`);
      }
    }
  }

  /**
   * Re-fetch config from backend. Called by POST /reload-config.
   */
  async reload(): Promise<void> {
    await this.fetchConfig();
    console.log(`[ProxyConfig] Config reloaded for ${this.serverName}`);
  }

  /**
   * Resolve proxy config for a specific tool.
   * Tool override > Server config > null (direct).
   */
  getProxyForTool(toolName: string): ProxyConfig | null {
    const toolOverride = this.config.tools[toolName];
    if (toolOverride !== undefined) {
      // Explicit override exists
      if (!toolOverride || !toolOverride.enabled) {
        return null; // Explicitly disabled
      }
      return toolOverride;
    }
    // Inherit from server
    if (this.config.server && this.config.server.enabled) {
      return this.config.server;
    }
    return null;
  }

  /**
   * Get an undici Dispatcher (ProxyAgent) for a specific tool.
   * Returns null if no proxy is configured.
   */
  getDispatcherForTool(toolName: string): Dispatcher | null {
    const proxy = this.getProxyForTool(toolName);
    if (!proxy) return null;

    let proxyUrl = proxy.url;
    // Embed auth into URL if provided
    if (proxy.auth?.username && proxy.auth?.password) {
      const urlObj = new URL(proxyUrl);
      urlObj.username = proxy.auth.username;
      urlObj.password = proxy.auth.password;
      proxyUrl = urlObj.toString();
    }

    return new ProxyAgent(proxyUrl);
  }

  /**
   * Check if a URL matches any bypass pattern.
   */
  shouldBypass(toolName: string, targetUrl: string): boolean {
    const proxy = this.getProxyForTool(toolName);
    if (!proxy?.bypass_patterns?.length) return false;

    return proxy.bypass_patterns.some((pattern) => {
      // Convert glob to regex: *.example.com -> .*\.example\.com
      const regex = new RegExp(
        "^" + pattern.replace(/\./g, "\\.").replace(/\*/g, ".*") + "$"
      );
      try {
        const hostname = new URL(targetUrl).hostname;
        return regex.test(hostname);
      } catch {
        return false;
      }
    });
  }

  /**
   * Get current config for debugging (GET /proxy-status).
   */
  getStatus(): ServerProxyConfig {
    return { ...this.config };
  }

  private async fetchConfig(): Promise<void> {
    const url = `${this.backendUrl}/api/tools/servers/by-name/${this.serverName}/proxy`;
    const response = await fetch(url, {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      throw new Error(`Backend returned ${response.status}`);
    }
    this.config = await response.json();
  }
}
