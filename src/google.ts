import { getGoogleAccessToken } from "./auth.ts";

async function googleJson<T>(url: string, init?: RequestInit): Promise<T> {
  const token = await getGoogleAccessToken();
  const response = await fetch(url, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) throw new Error(`Google API ${response.status}: ${(await response.text()).slice(0, 700)}`);
  return await response.json() as T;
}

export async function fileModifiedTime(fileId: string): Promise<string | null> {
  const data = await googleJson<{ modifiedTime?: string }>(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=modifiedTime`,
  );
  return data.modifiedTime ?? null;
}

export async function sheetsBatchGet(spreadsheetId: string, ranges: string[]): Promise<Record<string, unknown[][]>> {
  if (!ranges.length) return {};
  const params = new URLSearchParams();
  for (const range of ranges) params.append("ranges", range);
  params.set("majorDimension", "ROWS");
  const data = await googleJson<{ valueRanges?: Array<{ range: string; values?: unknown[][] }> }>(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values:batchGet?${params}`,
  );
  const out: Record<string, unknown[][]> = {};
  // Sheets batchGet preserves the request order. Google may normalize the returned
  // range to the last non-empty row, so matching by the requested A1 string can
  // silently drop valid tables (for example A1:I200 may return A1:I27).
  for (let i = 0; i < ranges.length; i++) {
    out[ranges[i]] = data.valueRanges?.[i]?.values ?? [];
  }
  return out;
}

export async function sheetsBatchUpdate(
  spreadsheetId: string,
  writes: Array<{ range: string; values: unknown[][] }>,
): Promise<{ totalUpdatedCells?: number }> {
  if (!writes.length) return { totalUpdatedCells: 0 };
  return await googleJson(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values:batchUpdate`,
    {
      method: "POST",
      body: JSON.stringify({
        valueInputOption: "RAW",
        data: writes.map((w) => ({ range: w.range, majorDimension: "ROWS", values: w.values })),
      }),
    },
  );
}

function flattenStructural(elements: any[] | undefined): string {
  let out = "";
  for (const element of elements ?? []) {
    for (const pe of element.paragraph?.elements ?? []) out += pe.textRun?.content ?? "";
    for (const row of element.table?.tableRows ?? []) {
      for (const cell of row.tableCells ?? []) out += flattenStructural(cell.content);
    }
    if (element.tableOfContents?.content) out += flattenStructural(element.tableOfContents.content);
  }
  return out;
}

export async function docsGet(documentId: string): Promise<{ text: string; revisionId: string | null; tabId?: string }> {
  const doc = await googleJson<any>(
    `https://docs.googleapis.com/v1/documents/${encodeURIComponent(documentId)}?includeTabsContent=true`,
  );
  if (doc.tabs?.length) {
    const text = doc.tabs.map((tab: any) => flattenStructural(tab.documentTab?.body?.content)).join("\n");
    return { text, revisionId: doc.revisionId ?? null, tabId: doc.tabs[0]?.tabProperties?.tabId };
  }
  return { text: flattenStructural(doc.body?.content), revisionId: doc.revisionId ?? null };
}

export async function docsAppendIdempotent(documentId: string, txId: string, text: string): Promise<{ skipped: boolean }> {
  const current = await docsGet(documentId);
  const marker = `[TX:${txId}]`;
  if (current.text.includes(marker)) return { skipped: true };
  const endOfSegmentLocation = current.tabId ? { tabId: current.tabId } : {};
  const body: any = {
    requests: [{ insertText: { endOfSegmentLocation, text: `\n${marker}\n${text.trim()}\n` } }],
  };
  if (current.revisionId) body.writeControl = { requiredRevisionId: current.revisionId };
  await googleJson(
    `https://docs.googleapis.com/v1/documents/${encodeURIComponent(documentId)}:batchUpdate`,
    { method: "POST", body: JSON.stringify(body) },
  );
  return { skipped: false };
}
