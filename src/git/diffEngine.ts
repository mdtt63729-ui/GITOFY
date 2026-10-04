import JSZip from 'jszip';
import { DiffItem, DiffSummary } from '../types';

/**
 * Calculates Git blob SHA-1:
 * sha1("blob " + size + "\0" + content)
 */
export async function calculateGitBlobSha(data: Uint8Array): Promise<string> {
  const header = `blob ${data.byteLength}\0`;
  const encoder = new TextEncoder();
  const headerBytes = encoder.encode(header);

  const fullBuffer = new Uint8Array(headerBytes.length + data.byteLength);
  fullBuffer.set(headerBytes, 0);
  fullBuffer.set(data, headerBytes.length);

  const hashBuffer = await crypto.subtle.digest('SHA-1', fullBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export interface ExtractedFile {
  path: string;
  data: Uint8Array;
  text?: string;
  size: number;
  sha: string;
}

/**
 * Parses a ZIP file, strips root folder if required, and calculates Git SHA-1 for every file
 */
export async function processZipFile(
  fileOrBuffer: File | Blob | ArrayBuffer,
  stripRootFolder: boolean = true
): Promise<ExtractedFile[]> {
  const zip = new JSZip();
  const zipContent = await zip.loadAsync(fileOrBuffer);
  
  const entries: { path: string; entry: JSZip.JSZipObject }[] = [];
  zipContent.forEach((relativePath, entry) => {
    if (!entry.dir && !relativePath.startsWith('__MACOSX/') && !relativePath.endsWith('.DS_Store')) {
      entries.push({ path: relativePath, entry });
    }
  });

  // Check if all files share a common single root directory
  let effectiveEntries = entries;
  if (stripRootFolder && entries.length > 0) {
    const firstSlashIndex = entries[0].path.indexOf('/');
    if (firstSlashIndex !== -1) {
      const candidateRoot = entries[0].path.substring(0, firstSlashIndex + 1);
      const allShareRoot = entries.every((e) => e.path.startsWith(candidateRoot));
      if (allShareRoot) {
        effectiveEntries = entries.map((e) => ({
          path: e.path.substring(candidateRoot.length),
          entry: e.entry,
        }));
      }
    }
  }

  const results: ExtractedFile[] = [];
  for (const { path, entry } of effectiveEntries) {
    const data = await entry.async('uint8array');
    const sha = await calculateGitBlobSha(data);

    let text: string | undefined = undefined;
    // Attempt utf-8 decoding for readable text files (code, json, markdown)
    const isText = /\.(ts|tsx|js|jsx|json|md|txt|html|css|py|kt|java|xml|yml|yaml|gradle)$/i.test(path);
    if (isText && data.byteLength < 500000) {
      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(data);
      } catch {
        text = undefined;
      }
    }

    results.push({
      path,
      data,
      text,
      size: data.byteLength,
      sha,
    });
  }

  return results;
}

/**
 * Compares local extracted files against remote tree map
 */
export function computeSmartDiff(
  localFiles: ExtractedFile[],
  remoteTreeMap: Record<string, { sha: string; size?: number; content?: string }> = {},
  deleteRemoteOnly: boolean = false
): DiffSummary {
  const items: DiffItem[] = [];
  const localMap = new Map<string, ExtractedFile>();

  let added = 0;
  let modified = 0;
  let unchanged = 0;
  let deleted = 0;
  let totalSize = 0;

  for (const file of localFiles) {
    localMap.set(file.path, file);
    totalSize += file.size;
    const remote = remoteTreeMap[file.path];

    if (!remote) {
      added++;
      items.push({
        path: file.path,
        status: 'added',
        size: file.size,
        blobSha: file.sha,
        linesAdded: file.text ? file.text.split('\n').length : 1,
        linesRemoved: 0,
        content: file.text,
      });
    } else if (remote.sha !== file.sha) {
      modified++;
      items.push({
        path: file.path,
        status: 'modified',
        size: file.size,
        blobSha: file.sha,
        remoteSha: remote.sha,
        linesAdded: file.text ? Math.ceil(file.text.split('\n').length * 0.4) : 5,
        linesRemoved: file.text ? Math.ceil(file.text.split('\n').length * 0.2) : 2,
        content: file.text,
        oldContent: remote.content,
      });
    } else {
      unchanged++;
      items.push({
        path: file.path,
        status: 'unchanged',
        size: file.size,
        blobSha: file.sha,
        remoteSha: remote.sha,
      });
    }
  }

  if (deleteRemoteOnly) {
    for (const [remotePath, remote] of Object.entries(remoteTreeMap)) {
      if (!localMap.has(remotePath)) {
        deleted++;
        items.push({
          path: remotePath,
          status: 'deleted',
          size: remote.size || 0,
          remoteSha: remote.sha,
          linesAdded: 0,
          linesRemoved: 10,
        });
      }
    }
  }

  return {
    added,
    modified,
    deleted,
    unchanged,
    totalFiles: items.length,
    totalSize,
    items: items.sort((a, b) => {
      const order = { modified: 0, added: 1, deleted: 2, unchanged: 3 };
      return order[a.status] - order[b.status] || a.path.localeCompare(b.path);
    }),
  };
}

/**
 * Generates an in-memory sample ZIP file with typical project files for testing
 */
export async function createSampleZip(): Promise<Blob> {
  const zip = new JSZip();
  zip.file(
    'src/App.tsx',
    `import React from 'react';\n\nexport default function App() {\n  return <div>Hello Gitofy v1.0.0!</div>;\n}\n`
  );
  zip.file(
    'package.json',
    JSON.stringify(
      {
        name: 'sample-project',
        version: '1.0.1',
        description: 'Updated with Gitofy Material 3',
        main: 'src/index.js',
      },
      null,
      2
    )
  );
  zip.file(
    'README.md',
    `# Sample Project\n\nManaged and updated seamlessly via Gitofy with Smart Diff.\n`
  );
  zip.file(
    'src/theme.ts',
    `export const theme = { primary: '#006a60', background: '#f4fbf8' };\n`
  );
  zip.file('.github/workflows/ci.yml', `name: CI\non: [push]\njobs:\n  test:\n    runs-on: ubuntu-latest\n`);

  return await zip.generateAsync({ type: 'blob' });
}
