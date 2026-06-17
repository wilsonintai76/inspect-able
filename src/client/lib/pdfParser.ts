import * as pdfjsLib from 'pdfjs-dist';

// Since we are using Vite, we need to point to the worker explicitly.
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

export async function parsePdfText(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  
  let fullText = '';
  
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      // @ts-ignore
      .map(item => item.str)
      .join(' ');
    fullText += pageText + '\n';
  }
  
  return fullText.trim();
}

/**
 * Direct pattern-matching extractor for KEW-PA 11 PDFs.
 * Extracts asset status breakdown without AI dependency.
 * Returns null if extraction fails — callers should fall back to AI.
 */
export function extractAssetData(text: string): {
  verifiedAssetCount: number | null;
  assetStatuses: Record<string, number>;
  notes: string;
} | null {
  const statusMap: Record<string, string[]> = {
    'In Use': ['sedang digunakan', 'in use', 'digunakan'],
    'Not In Use': ['tidak digunakan', 'not in use', 'tdk digunakan'],
    'Broken': ['rosak', 'broken', 'tidak boleh digunakan'],
    'Under Maintenance': ['sedang diselenggara', 'under maintenance', 'selenggara', 'penyelenggaraan'],
    'Borrowed': ['pinjaman', 'borrowed', 'dipinjam'],
    'Missing': ['hilang', 'missing', 'tidak dijumpai'],
  };

  const lower = text.toLowerCase();
  const result: Record<string, number> = {};
  let totalFound = 0;
  const patterns: string[] = [];
  
  // Try different regex patterns for each status
  for (const [status, keywords] of Object.entries(statusMap)) {
    for (const kw of keywords) {
      // Pattern: number near keyword (like "Sedang Digunakan : 25" or "25 Sedang Digunakan")
      const pat1 = new RegExp(`${kw}[^\\d]*[:=]?\\s*(\\d+)`, 'i');
      const pat2 = new RegExp(`(\\d+)\\s*[:=]?\\s*${kw}`, 'i');
      
      let m = lower.match(pat1) || lower.match(pat2);
      if (m) {
        const val = parseInt(m[1], 10);
        if (!isNaN(val) && val > 0) {
          result[status] = val;
          totalFound += val;
          patterns.push(`${status}: ${val} (matched "${m[0].trim()}")`);
          break;
        }
      }
    }
  }

  // Try to find total from "JUMLAH" or "TOTAL"
  let total = totalFound;
  const totalPat = /jumlah\s*(?:aset|keseluruhan)?[^\d]*(\d+)|total\s*(?:asset)?[^\d]*(\d+)/i;
  const totalM = lower.match(totalPat);
  if (totalM) {
    const t = parseInt(totalM[1] || totalM[2], 10);
    if (!isNaN(t) && t > totalFound) total = t;
  }

  // If we found nothing useful, return null
  if (Object.keys(result).length === 0) return null;

  return {
    verifiedAssetCount: total,
    assetStatuses: result,
    notes: patterns.length > 0 ? `Extracted via pattern: ${patterns.join(', ')}` : '',
  };
}
