import { saveAs } from 'file-saver';
import JSZip from 'jszip';

/**
 * Download a single text file
 */
export function downloadFile(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  saveAs(blob, filename);
}

/**
 * Download multiple files as a zip archive
 */
export async function downloadZip(
  files: Array<{ name: string; content: string }>,
  zipName: string
) {
  const zip = new JSZip();

  for (const file of files) {
    zip.file(file.name, file.content);
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  saveAs(blob, zipName);
}

/**
 * Generate a safe filename from workflow name
 */
export function toSafeFilename(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    || 'agent';
}
