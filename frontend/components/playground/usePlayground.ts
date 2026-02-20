'use client';

import { useState, useCallback, useRef } from 'react';

export interface StepEvent {
  step: 'classification' | 'routing' | 'agent_start' | 'tool_call' | 'tool_result' | 'response' | 'error' | 'decomposition' | 'task_assigned' | 'aggregation';
  agent_id?: string;
  tool_name?: string;
  data: Record<string, any>;
  timestamp: string;
  duration_ms?: number;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  steps?: StepEvent[];
  tokens?: { input: number; output: number };
  duration_ms?: number;
  error?: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export function usePlayground() {
  const [steps, setSteps] = useState<StepEvent[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const parseSSEStream = async (
    response: Response,
    onStep: (step: StepEvent) => void,
  ) => {
    const reader = response.body?.getReader();
    if (!reader) return;

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const event = JSON.parse(line.slice(6)) as StepEvent;
            onStep(event);
          } catch {
            // skip malformed lines
          }
        }
      }
    }

    // Process remaining buffer
    if (buffer.startsWith('data: ')) {
      try {
        const event = JSON.parse(buffer.slice(6)) as StepEvent;
        onStep(event);
      } catch {
        // skip
      }
    }
  };

  const runAgent = useCallback(async (
    message: string,
    agentConfig: any,
    toolsConfig: any[] = [],
  ) => {
    setIsRunning(true);
    const runSteps: StepEvent[] = [];
    setSteps([]);

    setMessages(prev => [...prev, { role: 'user', content: message }]);

    const conversationHistory = messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({ role: m.role, content: m.content }));

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch(`${API_URL}/api/playground/agent/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          agent_config: agentConfig,
          tools_config: toolsConfig,
          conversation_history: conversationHistory,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        const errorStep: StepEvent = {
          step: 'error',
          data: { error: `HTTP ${response.status}: ${errorText}` },
          timestamp: new Date().toISOString(),
        };
        runSteps.push(errorStep);
        setSteps([...runSteps]);
        setMessages(prev => [
          ...prev,
          { role: 'assistant', content: '', error: errorStep.data.error, steps: runSteps },
        ]);
        setIsRunning(false);
        return;
      }

      let responseText = '';
      let tokens = { input: 0, output: 0 };
      let totalDuration = 0;

      await parseSSEStream(response, (event) => {
        runSteps.push(event);
        setSteps([...runSteps]);

        if (event.step === 'response') {
          responseText = event.data.text || '';
          tokens = {
            input: event.data.input_tokens || 0,
            output: event.data.output_tokens || 0,
          };
          totalDuration = event.duration_ms || 0;
        }
        if (event.step === 'error') {
          responseText = '';
        }
      });

      const errorStep = runSteps.find(s => s.step === 'error');
      if (errorStep) {
        setMessages(prev => [
          ...prev,
          { role: 'assistant', content: '', error: errorStep.data.error, steps: runSteps },
        ]);
      } else {
        setMessages(prev => [
          ...prev,
          {
            role: 'assistant',
            content: responseText,
            steps: runSteps,
            tokens,
            duration_ms: totalDuration,
          },
        ]);
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        const errorStep: StepEvent = {
          step: 'error',
          data: { error: err.message || 'Connection failed' },
          timestamp: new Date().toISOString(),
        };
        runSteps.push(errorStep);
        setSteps([...runSteps]);
        setMessages(prev => [
          ...prev,
          { role: 'assistant', content: '', error: err.message, steps: runSteps },
        ]);
      }
    }

    setIsRunning(false);
  }, [messages]);

  const runInfra = useCallback(async (
    message: string,
    infraId: string,
  ) => {
    setIsRunning(true);
    const runSteps: StepEvent[] = [];
    setSteps([]);

    setMessages(prev => [...prev, { role: 'user', content: message }]);

    const conversationHistory = messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({ role: m.role, content: m.content }));

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch(`${API_URL}/api/playground/infra/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          infrastructure_id: infraId,
          conversation_history: conversationHistory,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        const errorStep: StepEvent = {
          step: 'error',
          data: { error: `HTTP ${response.status}: ${errorText}` },
          timestamp: new Date().toISOString(),
        };
        runSteps.push(errorStep);
        setSteps([...runSteps]);
        setMessages(prev => [
          ...prev,
          { role: 'assistant', content: '', error: errorStep.data.error, steps: runSteps },
        ]);
        setIsRunning(false);
        return;
      }

      let responseText = '';
      let tokens = { input: 0, output: 0 };
      let totalDuration = 0;

      await parseSSEStream(response, (event) => {
        runSteps.push(event);
        setSteps([...runSteps]);

        if (event.step === 'response') {
          responseText = event.data.text || '';
          tokens = {
            input: event.data.input_tokens || 0,
            output: event.data.output_tokens || 0,
          };
          totalDuration = event.duration_ms || 0;
        }
      });

      const errorStep = runSteps.find(s => s.step === 'error');
      if (errorStep) {
        setMessages(prev => [
          ...prev,
          { role: 'assistant', content: '', error: errorStep.data.error, steps: runSteps },
        ]);
      } else {
        setMessages(prev => [
          ...prev,
          {
            role: 'assistant',
            content: responseText,
            steps: runSteps,
            tokens,
            duration_ms: totalDuration,
          },
        ]);
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setMessages(prev => [
          ...prev,
          { role: 'assistant', content: '', error: err.message, steps: [] },
        ]);
      }
    }

    setIsRunning(false);
  }, [messages]);

  const clearConversation = useCallback(() => {
    setMessages([]);
    setSteps([]);
  }, []);

  const stopRun = useCallback(() => {
    abortRef.current?.abort();
    setIsRunning(false);
  }, []);

  return {
    steps,
    messages,
    isRunning,
    runAgent,
    runInfra,
    clearConversation,
    stopRun,
    activeStep: steps.length > 0 ? steps[steps.length - 1] : null,
  };
}
