'use client';

export type ValidationSeverity = 'error' | 'warning';

export interface ValidationError {
  id: string;
  nodeId?: string;
  nodeName?: string;
  field?: string;
  message: string;
  severity: ValidationSeverity;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}
