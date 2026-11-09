// A small PDF writer for the demo's report downloads: A4 pages with Helvetica text (regular and bold), boxes, lines and
// shapes, so a report can be properly designed. Text is measured with Helvetica's real character widths, so a layout
// can fit, wrap or shorten it and nothing overlaps. Demo only: the real backend produces the real PDFs.

export const PAGE_WIDTH = 595;
export const PAGE_HEIGHT = 842;

export type Font = "regular" | "bold";

// Helvetica character widths (per 1000 units) for characters 32 to 126
const REGULAR = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667,
  556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722,
  500, 500, 500, 334, 260, 334, 584,
];
const BOLD = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722,
  611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778,
  556, 556, 500, 389, 280, 389, 584,
];

/** Characters outside plain ASCII that the PDF's Windows-1252 text can show */
const SPECIAL: Record<string, { code: number; regular: number; bold: number }> = {
  "–": { code: 0x96, regular: 556, bold: 556 },
  "—": { code: 0x97, regular: 1000, bold: 1000 },
  "…": { code: 0x85, regular: 1000, bold: 1000 },
  "•": { code: 0x95, regular: 350, bold: 350 },
  "‘": { code: 0x91, regular: 222, bold: 278 },
  "’": { code: 0x92, regular: 222, bold: 278 },
  "“": { code: 0x93, regular: 333, bold: 500 },
  "”": { code: 0x94, regular: 333, bold: 500 },
};

/** The byte a character is written as, and how wide it is at 1pt */
function glyph(char: string, font: Font) {
  const special = SPECIAL[char];
  if (special) return { code: special.code, width: special[font] / 1000 };
  const code = char.charCodeAt(0);
  if (code >= 32 && code <= 126) return { code, width: (font === "bold" ? BOLD : REGULAR)[code - 32] / 1000 };
  if (code >= 0xa0 && code <= 0xff) return { code, width: 0.556 };
  return { code: 0x3f, width: 0.556 };
}

/** How wide text is on the page, in points */
export function measure(text: string, size: number, font: Font = "regular") {
  let width = 0;
  for (const char of text) width += glyph(char, font).width;
  return width * size;
}

/** The text, shortened with "…" so it fits in `maxWidth` */
export function fit(text: string, maxWidth: number, size: number, font: Font = "regular") {
  if (measure(text, size, font) <= maxWidth) return text;
  let shorter = text;
  while (shorter.length > 1 && measure(`${shorter}…`, size, font) > maxWidth) shorter = shorter.slice(0, -1);
  return `${shorter.trimEnd()}…`;
}

/** The text broken into lines that fit `maxWidth`; the last line is shortened if there is more than `maxLines` of it */
export function wrap(text: string, maxWidth: number, size: number, font: Font = "regular", maxLines = 99) {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (!line || measure(next, size, font) <= maxWidth) line = next;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) return [...lines.slice(0, maxLines - 1), fit(lines.slice(maxLines - 1).join(" "), maxWidth, size, font)];
  return lines.map((item) => fit(item, maxWidth, size, font));
}

/** "#2185f6" as "0.129 0.522 0.965" */
function rgb(hex: string) {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255].map((channel) => (channel / 255).toFixed(3)).join(" ");
}

const n = (value: number) => value.toFixed(2);

export interface BoxStyle {
  fill?: string;
  stroke?: string;
  lineWidth?: number;
  /** Corner radius */
  radius?: number;
}

/** One page. Positions are in points from the top-left corner of the page. */
export class PdfPage {
  readonly ops: string[] = [];

  /** Text on a baseline at (x, y); `align` says which side of x it sits on */
  text(text: string, x: number, y: number, { size = 10, font = "regular", color = "#1b2430", align = "left" }: { size?: number; font?: Font; color?: string; align?: "left" | "right" | "center" } = {}) {
    if (!text) return;
    const width = measure(text, size, font);
    const left = align === "right" ? x - width : align === "center" ? x - width / 2 : x;
    const bytes = [...text].map((char) => String.fromCharCode(glyph(char, font).code)).join("");
    const escaped = bytes.replace(/[\\()]/g, (char) => `\\${char}`);
    this.ops.push(`BT /${font === "bold" ? "F2" : "F1"} ${size} Tf ${rgb(color)} rg ${n(left)} ${n(PAGE_HEIGHT - y)} Td (${escaped}) Tj ET`);
  }

  /** A box, optionally with rounded corners */
  box(x: number, y: number, width: number, height: number, { fill, stroke, lineWidth = 0.75, radius = 0 }: BoxStyle) {
    if (!fill && !stroke) return;
    const bottom = PAGE_HEIGHT - y - height;
    const r = Math.min(radius, width / 2, height / 2);
    let path: string;
    if (r <= 0) path = `${n(x)} ${n(bottom)} ${n(width)} ${n(height)} re`;
    else {
      const k = r * 0.5523;
      const right = x + width;
      const top = bottom + height;
      path = [
        `${n(x + r)} ${n(bottom)} m`,
        `${n(right - r)} ${n(bottom)} l`,
        `${n(right - r + k)} ${n(bottom)} ${n(right)} ${n(bottom + r - k)} ${n(right)} ${n(bottom + r)} c`,
        `${n(right)} ${n(top - r)} l`,
        `${n(right)} ${n(top - r + k)} ${n(right - r + k)} ${n(top)} ${n(right - r)} ${n(top)} c`,
        `${n(x + r)} ${n(top)} l`,
        `${n(x + r - k)} ${n(top)} ${n(x)} ${n(top - r + k)} ${n(x)} ${n(top - r)} c`,
        `${n(x)} ${n(bottom + r)} l`,
        `${n(x)} ${n(bottom + r - k)} ${n(x + r - k)} ${n(bottom)} ${n(x + r)} ${n(bottom)} c`,
        "h",
      ].join(" ");
    }
    this.paint(path, { fill, stroke, lineWidth });
  }

  line(x1: number, y1: number, x2: number, y2: number, { color = "#e3e7ed", width = 0.75, dash }: { color?: string; width?: number; dash?: [number, number] } = {}) {
    this.ops.push(`q ${rgb(color)} RG ${width} w ${dash ? `[${dash[0]} ${dash[1]}] 0 d` : ""} ${n(x1)} ${n(PAGE_HEIGHT - y1)} m ${n(x2)} ${n(PAGE_HEIGHT - y2)} l S Q`);
  }

  /** A line through points, optionally closed down to `floor` and filled (an area) */
  polyline(points: [number, number][], { color, width = 1.5, area, dash }: { color: string; width?: number; area?: { fill: string; floor: number }; dash?: [number, number] }) {
    if (points.length < 2) return;
    const at = ([x, y]: [number, number]) => `${n(x)} ${n(PAGE_HEIGHT - y)}`;
    const path = `${at(points[0])} m ${points.slice(1).map((point) => `${at(point)} l`).join(" ")}`;
    if (area) this.paint(`${path} ${at([points[points.length - 1][0], area.floor])} l ${at([points[0][0], area.floor])} l h`, { fill: area.fill });
    this.ops.push(`q ${rgb(color)} RG ${width} w 1 j 1 J ${dash ? `[${dash[0]} ${dash[1]}] 0 d` : ""} ${path} S Q`);
  }

  /** A ring slice between two angles (radians, clockwise from twelve o'clock) */
  ringSlice(cx: number, cy: number, outer: number, inner: number, from: number, to: number, { fill, gap = "#ffffff" }: { fill: string; gap?: string }) {
    const point = (radius: number, angle: number): [number, number] => [cx + radius * Math.sin(angle), PAGE_HEIGHT - (cy - radius * Math.cos(angle))];
    const arc = (radius: number, start: number, end: number) => {
      // Curves of at most a quarter turn each
      const pieces = Math.max(1, Math.ceil(Math.abs(end - start) / (Math.PI / 2)));
      const step = (end - start) / pieces;
      const k = (4 / 3) * Math.tan(step / 4);
      let out = "";
      for (let index = 0; index < pieces; index += 1) {
        const a = start + step * index;
        const b = a + step;
        const [x1, y1] = point(radius, a);
        const [x2, y2] = point(radius, b);
        // Control points along the tangent at each end (clockwise on screen; the PDF's y axis points up)
        const c1: [number, number] = [x1 + k * radius * Math.cos(a), y1 - k * radius * Math.sin(a)];
        const c2: [number, number] = [x2 - k * radius * Math.cos(b), y2 + k * radius * Math.sin(b)];
        out += `${n(c1[0])} ${n(c1[1])} ${n(c2[0])} ${n(c2[1])} ${n(x2)} ${n(y2)} c `;
      }
      return out;
    };
    const [sx, sy] = point(outer, from);
    const [ix, iy] = point(inner, to);
    const path = `${n(sx)} ${n(sy)} m ${arc(outer, from, to)}${n(ix)} ${n(iy)} l ${arc(inner, to, from)}h`;
    this.paint(path, { fill, stroke: gap, lineWidth: 1.2 });
  }

  private paint(path: string, { fill, stroke, lineWidth = 0.75 }: { fill?: string; stroke?: string; lineWidth?: number }) {
    const operator = fill && stroke ? "B" : fill ? "f" : "S";
    this.ops.push(`q ${fill ? `${rgb(fill)} rg ` : ""}${stroke ? `${rgb(stroke)} RG ${lineWidth} w ` : ""}${path} ${operator} Q`);
  }
}

/** The pages as a PDF file (A4, one font family, the title shown by PDF viewers). */
export function buildDocument(pages: PdfPage[], title: string): Blob {
  const objects: string[] = [];
  const add = (object: string) => objects.push(object);
  add("<< /Type /Catalog /Pages 2 0 R >>");
  add("");
  add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  add(`<< /Title (${title.replace(/[^\x20-\x7e]/g, "-").replace(/[\\()]/g, (char) => `\\${char}`)}) /Creator (Tamu Loans) >>`);
  const kids: number[] = [];
  for (const page of pages) {
    const content = page.ops.join("\n");
    add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    kids.push(objects.length + 1);
    add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Contents ${objects.length} 0 R /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> >>`);
  }
  objects[1] = `<< /Type /Pages /Kids [${kids.map((id) => `${id} 0 R`).join(" ")}] /Count ${kids.length} >>`;

  // Everything is single-byte text, so one character is one byte
  let file = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(file.length);
    file += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = file.length;
  file += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}`;
  file += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const bytes = new Uint8Array(file.length);
  for (let index = 0; index < file.length; index += 1) bytes[index] = file.charCodeAt(index);
  return new Blob([bytes], { type: "application/pdf" });
}
