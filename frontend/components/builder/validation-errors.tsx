'use client';

import React from 'react';
import { Alert, Badge } from 'antd';
import { AlertTriangle, XCircle } from 'lucide-react';
import { ValidationResult, ValidationError } from './validation';
import { useTeamBuilderStore } from './store';

interface ValidationErrorsProps {
  result: ValidationResult;
  onClose: () => void;
}

/**
 * Displays workflow validation errors and warnings in a non-blocking panel.
 * Clicking on an error with a nodeId will select that node in the canvas.
 */
export const ValidationErrors: React.FC<ValidationErrorsProps> = ({
  result,
  onClose,
}) => {
  const setSelectedNode = useTeamBuilderStore(state => state.setSelectedNode);

  const handleErrorClick = (error: ValidationError) => {
    if (error.nodeId) {
      setSelectedNode(error.nodeId);
    }
  };

  if (result.valid && result.warnings.length === 0) {
    return null;
  }

  const errorCount = result.errors.length;
  const warningCount = result.warnings.length;

  return (
    <div className="absolute bottom-4 left-4 right-4 z-50 max-w-lg">
      <Alert
        type={errorCount > 0 ? 'error' : 'warning'}
        message={
          <div className="flex items-center justify-between">
            <span className="font-medium">
              {errorCount > 0 ? (
                <>Workflow has {errorCount} error{errorCount !== 1 ? 's' : ''}</>
              ) : (
                <>Workflow has {warningCount} warning{warningCount !== 1 ? 's' : ''}</>
              )}
            </span>
            <div className="flex gap-2">
              {errorCount > 0 && (
                <Badge count={errorCount} style={{ backgroundColor: '#ef4444' }} />
              )}
              {warningCount > 0 && (
                <Badge count={warningCount} style={{ backgroundColor: '#f59e0b' }} />
              )}
            </div>
          </div>
        }
        description={
          <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
            {result.errors.map((error) => (
              <div
                key={error.id}
                onClick={() => handleErrorClick(error)}
                className={`flex items-start gap-2 p-2 rounded bg-red-50 ${
                  error.nodeId ? 'cursor-pointer hover:bg-red-100' : ''
                }`}
              >
                <XCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                  {error.nodeName && (
                    <span className="font-medium text-red-700">{error.nodeName}: </span>
                  )}
                  <span className="text-red-600">{error.message}</span>
                  {error.field && (
                    <span className="text-red-400 text-xs ml-1">({error.field})</span>
                  )}
                </div>
              </div>
            ))}
            {result.warnings.map((warning) => (
              <div
                key={warning.id}
                onClick={() => handleErrorClick(warning)}
                className={`flex items-start gap-2 p-2 rounded bg-amber-50 ${
                  warning.nodeId ? 'cursor-pointer hover:bg-amber-100' : ''
                }`}
              >
                <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                  {warning.nodeName && (
                    <span className="font-medium text-amber-700">{warning.nodeName}: </span>
                  )}
                  <span className="text-amber-600">{warning.message}</span>
                </div>
              </div>
            ))}
          </div>
        }
        closable
        onClose={onClose}
      />
    </div>
  );
};

export default ValidationErrors;
