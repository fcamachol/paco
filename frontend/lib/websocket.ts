"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "./auth";

const WS_BASE_URL =
  process.env.NEXT_PUBLIC_WS_URL ||
  (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000")
    .replace(/^http/, "ws");

const MAX_RECONNECT_DELAY = 30000;
const INITIAL_RECONNECT_DELAY = 1000;

interface UseWebSocketReturn<T = any> {
  data: T | null;
  isConnected: boolean;
  error: string | null;
}

export function useWebSocket<T = any>(channel: string): UseWebSocketReturn<T> {
  const { token } = useAuth();
  const [data, setData] = useState<T | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectDelay = useRef(INITIAL_RECONNECT_DELAY);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmounted = useRef(false);

  const connect = useCallback(() => {
    if (unmounted.current || !token) return;

    // Clean up existing connection
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    const url = `${WS_BASE_URL}/${channel}?token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      if (unmounted.current) return;
      setIsConnected(true);
      setError(null);
      reconnectDelay.current = INITIAL_RECONNECT_DELAY;
    };

    ws.onmessage = (event) => {
      if (unmounted.current) return;
      try {
        const parsed = JSON.parse(event.data);
        setData(parsed);
      } catch {
        // Ignore non-JSON messages
      }
    };

    ws.onerror = () => {
      if (unmounted.current) return;
      setError("WebSocket connection error");
    };

    ws.onclose = (event) => {
      if (unmounted.current) return;
      setIsConnected(false);

      if (event.code === 4001) {
        setError("Unauthorized");
        return;
      }

      // Exponential backoff reconnect
      reconnectTimer.current = setTimeout(() => {
        reconnectDelay.current = Math.min(
          reconnectDelay.current * 2,
          MAX_RECONNECT_DELAY
        );
        connect();
      }, reconnectDelay.current);
    };
  }, [channel, token]);

  useEffect(() => {
    unmounted.current = false;
    connect();

    return () => {
      unmounted.current = true;
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  return { data, isConnected, error };
}
