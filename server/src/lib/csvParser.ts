/**
 * Minimal RFC 4180 CSV parser — handles quoted fields, commas and
 * newlines inside quotes, and "" as an escaped quote. No dependency: this
 * app has avoided adding one everywhere it reasonably could (see
 * client/src/lib/csv.ts, the export-side equivalent of this file), and a
 * hand-rolled parser is small enough to read in one sitting and trust.
 *
 * Returns rows of raw string cells — callers own all type coercion and
 * validation (see openingBalances.ts), so this file never throws on bad
 * data, only on malformed CSV syntax (an unterminated quote).
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  // Normalize line endings so \r\n and \r alone behave like \n.
  const input = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  let i = 0;
  while (i < input.length) {
    const char = input[i];

    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += char;
      i++;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (char === ",") {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
      continue;
    }
    field += char;
    i++;
  }

  if (inQuotes) {
    throw new Error("Malformed CSV: a quoted field is never closed");
  }
  // Last field/row, unless the file ended with a trailing newline (in
  // which case there's nothing left to flush).
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // Drop fully-blank trailing rows (a common artifact of spreadsheet
  // exports) so callers don't have to special-case them.
  while (rows.length > 0 && rows[rows.length - 1].every((cell) => cell.trim() === "")) {
    rows.pop();
  }

  return rows;
}

/**
 * Strips leading "# ..." comment lines, so the hint lines this app's own
 * downloadable templates put above the real header (e.g. "# Active loan
 * products you can use for loan_product_name: ...") don't get mistaken
 * for the header row when a cooperative re-uploads the template
 * unmodified. Only strips from the very start of the file — a "#" that
 * shows up later, inside real data, is left alone.
 */
function stripLeadingComments(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  let i = 0;
  while (i < lines.length && lines[i].trim().startsWith("#")) i++;
  return lines.slice(i).join("\n");
}

/**
 * Parses a CSV with a header row into objects keyed by header name
 * (trimmed, as-is — callers normalize case/whitespace themselves if
 * needed). Returns [] for an empty or header-only file.
 */
export function parseCsvWithHeader(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const raw = parseCsv(stripLeadingComments(text));
  if (raw.length === 0) return { headers: [], rows: [] };
  const headers = raw[0].map((h) => h.trim());
  const rows = raw.slice(1).map((cells) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = (cells[idx] ?? "").trim();
    });
    return obj;
  });
  return { headers, rows };
}
