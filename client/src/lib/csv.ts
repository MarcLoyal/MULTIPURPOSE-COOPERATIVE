type CsvSection = {
  title: string;
  headers: string[];
  rows: (string | number)[][];
};

function escapeCsvField(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Builds a single CSV file out of multiple labeled sections (a title
 * line, a header row, then data rows, then a blank line) — the
 * simplest way to export a composite, multi-statement report as one
 * file that still opens sensibly in Excel/Sheets, without a
 * server-side export endpoint or a new file-generation dependency.
 */
export function downloadCsv(filename: string, sections: CsvSection[]) {
  const lines: string[] = [];
  for (const section of sections) {
    lines.push(escapeCsvField(section.title));
    lines.push(section.headers.map(escapeCsvField).join(","));
    for (const row of section.rows) {
      lines.push(row.map(escapeCsvField).join(","));
    }
    lines.push("");
  }

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
