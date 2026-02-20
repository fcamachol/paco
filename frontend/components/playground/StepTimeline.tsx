'use client';

import React, { useState } from 'react';
import {
  Brain,
  ArrowRight,
  Bot,
  Wrench,
  CheckCircle,
  MessageSquare,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Clock,
} from 'lucide-react';
import { StepEvent } from './usePlayground';

const STEP_CONFIG: Record<string, {
  icon: React.ElementType;
  label: string;
  color: string;
  bgColor: string;
}> = {
  classification: {
    icon: Brain,
    label: 'Classification',
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/20',
  },
  routing: {
    icon: ArrowRight,
    label: 'Routing',
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/20',
  },
  agent_start: {
    icon: Bot,
    label: 'Agent Start',
    color: 'text-green-400',
    bgColor: 'bg-green-500/20',
  },
  tool_call: {
    icon: Wrench,
    label: 'Tool Call',
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/20',
  },
  tool_result: {
    icon: CheckCircle,
    label: 'Tool Result',
    color: 'text-green-400',
    bgColor: 'bg-green-500/20',
  },
  response: {
    icon: MessageSquare,
    label: 'Response',
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/20',
  },
  error: {
    icon: AlertCircle,
    label: 'Error',
    color: 'text-error',
    bgColor: 'bg-error/20',
  },
  decomposition: {
    icon: Brain,
    label: 'Decomposition',
    color: 'text-cyan-400',
    bgColor: 'bg-cyan-500/20',
  },
  task_assigned: {
    icon: ArrowRight,
    label: 'Task Assigned',
    color: 'text-indigo-400',
    bgColor: 'bg-indigo-500/20',
  },
  aggregation: {
    icon: Brain,
    label: 'Aggregation',
    color: 'text-cyan-400',
    bgColor: 'bg-cyan-500/20',
  },
};

interface StepTimelineProps {
  steps: StepEvent[];
  collapsed?: boolean;
}

export const StepTimeline: React.FC<StepTimelineProps> = ({ steps, collapsed = false }) => {
  const [isExpanded, setIsExpanded] = useState(!collapsed);
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());

  const toggleStep = (idx: number) => {
    setExpandedSteps(prev => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
  };

  if (steps.length === 0) return null;

  return (
    <div className="mt-2">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-1 text-xs text-foreground-muted hover:text-foreground transition-colors"
      >
        {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        {steps.length} step{steps.length !== 1 ? 's' : ''}
      </button>

      {isExpanded && (
        <div className="mt-1 ml-1 border-l-2 border-border pl-3 space-y-1">
          {steps.map((step, idx) => {
            const config = STEP_CONFIG[step.step] || STEP_CONFIG.error;
            const Icon = config.icon;
            const isStepExpanded = expandedSteps.has(idx);
            const hasDetails = Object.keys(step.data).length > 0;

            return (
              <div key={idx} className="relative">
                {/* Timeline dot */}
                <div className={`absolute -left-[19px] top-1 w-2.5 h-2.5 rounded-full ${config.bgColor} border-2 border-background-secondary`} />

                <div
                  className={`text-xs ${hasDetails ? 'cursor-pointer' : ''}`}
                  onClick={() => hasDetails && toggleStep(idx)}
                >
                  <div className="flex items-center gap-1.5">
                    <Icon className={`w-3 h-3 ${config.color}`} />
                    <span className="font-medium text-foreground">
                      {config.label}
                      {step.tool_name && <span className="text-foreground-muted ml-1">{step.tool_name}</span>}
                      {step.agent_id && step.step === 'routing' && (
                        <span className="text-foreground-muted ml-1">→ {step.agent_id}</span>
                      )}
                    </span>
                    {step.duration_ms != null && (
                      <span className="flex items-center gap-0.5 text-foreground-muted ml-auto">
                        <Clock className="w-2.5 h-2.5" />
                        {step.duration_ms < 1000
                          ? `${Math.round(step.duration_ms)}ms`
                          : `${(step.duration_ms / 1000).toFixed(1)}s`}
                      </span>
                    )}
                    {hasDetails && (
                      <span className="text-foreground-muted">
                        {isStepExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                      </span>
                    )}
                  </div>

                  {/* Brief inline summary */}
                  {!isStepExpanded && step.step === 'classification' && step.data.category && (
                    <div className="ml-4.5 text-foreground-muted truncate">
                      {step.data.category}
                      {step.data.confidence != null && ` (${(step.data.confidence * 100).toFixed(0)}%)`}
                    </div>
                  )}
                  {!isStepExpanded && step.step === 'decomposition' && step.data.task_count != null && (
                    <div className="ml-4.5 text-foreground-muted truncate">
                      {step.data.task_count} task{step.data.task_count !== 1 ? 's' : ''}
                    </div>
                  )}
                  {!isStepExpanded && step.step === 'task_assigned' && step.agent_id && (
                    <div className="ml-4.5 text-foreground-muted truncate">
                      {step.agent_id}: {step.data.task}
                    </div>
                  )}
                  {!isStepExpanded && step.step === 'aggregation' && step.data.strategy && (
                    <div className="ml-4.5 text-foreground-muted truncate">
                      Strategy: {step.data.strategy}
                    </div>
                  )}
                  {!isStepExpanded && step.step === 'error' && step.data.error && (
                    <div className="ml-4.5 text-error truncate">{step.data.error}</div>
                  )}

                  {/* Expanded details */}
                  {isStepExpanded && hasDetails && (
                    <div className="ml-4.5 mt-1 p-2 bg-background rounded text-xs font-mono overflow-x-auto max-h-40 overflow-y-auto">
                      <pre className="whitespace-pre-wrap break-words text-foreground-muted">
                        {JSON.stringify(step.data, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
