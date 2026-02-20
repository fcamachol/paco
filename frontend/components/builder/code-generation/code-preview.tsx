'use client';

import Editor from '@monaco-editor/react';

interface CodePreviewProps {
  code: string;
  language: 'typescript' | 'python';
  height?: string;
  readOnly?: boolean;
  onChange?: (value: string | undefined) => void;
}

/**
 * CodePreview - Monaco Editor-based code preview component
 *
 * Displays generated code with syntax highlighting and optional editing.
 * Uses VS Code's Monaco editor for professional code editing experience.
 */
export function CodePreview({
  code,
  language,
  height = '400px',
  readOnly = true,
  onChange,
}: CodePreviewProps) {
  return (
    <Editor
      height={height}
      language={language}
      value={code}
      onChange={onChange}
      options={{
        readOnly,
        minimap: { enabled: false },
        fontSize: 13,
        lineNumbers: 'on',
        scrollBeyondLastLine: false,
        automaticLayout: true,
        tabSize: 2,
        wordWrap: 'on',
      }}
      theme="vs-dark"
    />
  );
}
