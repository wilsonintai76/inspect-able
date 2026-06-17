import * as pdfjsLib from 'pdfjs-dist';

// Since we are using Vite, we need to point to the worker explicitly.
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

// ── Fluent text extraction ─────────────────────────────────────────

export async function parsePdfText(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  
  let fullText = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item: any) => item.str)
      .join(' ');
    fullText += pageText + '\n';
  }
  return fullText.trim();
}

// ── Position-based table extraction ────────────────────────────────

interface TextItem {
  str: string;
  x: number;
  y: number;
}

const STATUS_KEYWORDS: Record<string, string[]> = {
  'In Use': ['sedang digunakan', 'in use', 'digunakan', 'sedang diguna'],
  'Not In Use': ['tidak digunakan', 'not in use', 'tdk digunakan'],
  'Broken': ['rosak', 'broken', 'tidak boleh digunakan', 'rosak/tidak'],
  'Under Maintenance': ['sedang diselenggara', 'under maintenance', 'selenggara', 'penyelenggaraan'],
  'Borrowed': ['pinjaman', 'borrowed', 'dipinjam'],
  'Missing': ['hilang', 'missing', 'tidak dijumpai'],
};

/**
 * Position-based KEW-PA 11 table extractor.
 * Uses pdf.js text item coordinates to reconstruct table layout.
 * Deterministic — no AI, no network requests.
 */
export async function extractAssetData(file: File): Promise<{
  verifiedAssetCount: number | null;
  assetStatuses: Record<string, number>;
  notes: string;
} | null> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;

    const allItems: TextItem[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      for (const item of textContent.items) {
        const it = item as any;
        const s = it.str?.trim();
        if (!s) continue;
        allItems.push({ str: s, x: it.transform?.[4] || 0, y: it.transform?.[5] || 0 });
      }
    }
    if (allItems.length === 0) return null;

    // Group by Y-position (5px tolerance = same row)
    const rows = new Map<number, TextItem[]>();
    for (const item of [...allItems].sort((a, b) => a.y - b.y)) {
      let matched = false;
      for (const rowY of rows.keys()) {
        if (Math.abs(item.y - rowY) < 5) { rows.get(rowY)!.push(item); matched = true; break; }
      }
      if (!matched) rows.set(item.y, [item]);
    }

    // Cluster X positions to identify columns
    const xVals = [...new Set(allItems.map(i => i.x))].sort((a, b) => a - b);
    const xClusters: number[] = [];
    for (const x of xVals) {
      const last = xClusters[xClusters.length - 1];
      if (last === undefined || Math.abs(x - last) > 30) xClusters.push(x);
    }

    const labelXMin = xClusters[0] - 15;
    const labelXMax = xClusters[0] + 60;
    const numXMin = (xClusters[1] || allItems.reduce((s, i) => s + i.x, 0) / allItems.length / 2) - 20;
    const numXMax = (xClusters[xClusters.length - 1] || 999) + 60;

    // Match each row: label column → number column
    const result: Record<string, number> = {};
    const details: string[] = [];

    for (const [, rowItems] of rows) {
      const label = rowItems
        .filter(i => i.x >= labelXMin && i.x <= labelXMax)
        .map(i => i.str).join(' ').toLowerCase().replace(/\s+/g, ' ').trim();
      const nums = rowItems
        .filter(i => i.x >= numXMin && i.x <= numXMax && /^\d+$/.test(i.str))
        .map(i => parseInt(i.str, 10));
      if (!label || nums.length === 0) continue;

      // Check for JUMLAH/TOTAL row
      if (label.includes('jumlah') || label.includes('total')) continue;

      for (const [status, keywords] of Object.entries(STATUS_KEYWORDS)) {
        if (keywords.some(kw => label.includes(kw))) {
          result[status] = (result[status] || 0) + nums[0];
          details.push(`${status}: ${nums[0]}`);
          break;
        }
      }
    }

    if (Object.keys(result).length === 0) return null;

    // Find total from JUMLAH row
    let total = Object.values(result).reduce((s, v) => s + v, 0);
    for (const [, rowItems] of rows) {
      const label = rowItems
        .filter(i => i.x >= labelXMin && i.x <= labelXMax)
        .map(i => i.str).join(' ').toLowerCase();
      if (label.includes('jumlah') || label.includes('total')) {
        const nums = rowItems.filter(i => /^\d+$/.test(i.str)).map(i => parseInt(i.str, 10));
        if (nums.length > 0) total = nums[0];
      }
    }

    return { verifiedAssetCount: total, assetStatuses: result, notes: `Table: ${details.join(', ')}` };
  } catch {
    return null;
  }
}

/**
 * Regex fallback — runs on already-extracted text (no pdf.js re-parse).
 */
export function extractAssetDataFromText(text: string): {
  verifiedAssetCount: number | null;
  assetStatuses: Record<string, number>;
  notes: string;
} | null {
  const lower = text.toLowerCase();
  const result: Record<string, number> = {};
  const patterns: string[] = [];

  for (const [status, keywords] of Object.entries(STATUS_KEYWORDS)) {
    for (const kw of keywords) {
      const m = lower.match(new RegExp(`${kw}[^\\d]*[:=]?\\s*(\\d+)`, 'i'))
             || lower.match(new RegExp(`(\\d+)\\s*[:=]?\\s*${kw}`, 'i'));
      if (m) {
        const val = parseInt(m[1], 10);
        if (!isNaN(val) && val > 0) { result[status] = val; patterns.push(`${status}: ${val}`); break; }
      }
    }
  }
  if (Object.keys(result).length === 0) return null;
  return {
    verifiedAssetCount: Object.values(result).reduce((s, v) => s + v, 0),
    assetStatuses: result,
    notes: `Text match: ${patterns.join(', ')}`,
  };
}
