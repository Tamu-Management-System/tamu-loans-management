// Builds simple PDFs standing in for the documents the backend will produce (e.g. a loan
// application: agreement + two guarantor consents, one per page, with drawn signatures). Demo only.

/** A JPEG to place on the page (e.g. a signature drawn on the online form) */
export interface PdfImage {
  jpeg: Uint8Array;
  width: number;
  height: number;
}

export type PdfLine =
  | { text: string; size?: number; /** space above, in points */ gap?: number }
  | { image: PdfImage; /** height on the page, in points */ height: number; gap?: number }
  /** Several pieces of text on one line, e.g. a table row; `x` is from the left edge, right-aligned cells end at `x` */
  | { cells: { text: string; x: number; align?: "left" | "right" }[]; size?: number; gap?: number };

/** Roughly how wide Helvetica text is (good enough to right-align numbers) */
const textWidth = (text: string, size: number) => text.length * size * 0.52;

const encoder = new TextEncoder();

/** Escapes text for a PDF string literal (ASCII only). */
const pdfText = (text: string) => text.replace(/[\\()]/g, (char) => `\\${char}`).replace(/[^\x20-\x7e]/g, "-");

/** One A4 page per entry in `pages`. */
export function buildPdf(pages: PdfLine[][]): Blob {
  const objects: (string | Uint8Array[])[] = [];
  const add = (object: string | Uint8Array[]) => objects.push(object) && objects.length; // returns the object number

  const catalog = add("<< /Type /Catalog /Pages 2 0 R >>");
  const pageTree = add(""); // filled in once the pages are known
  const font = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const pageNumbers: number[] = [];

  for (const lines of pages) {
    let y = 790;
    const images: string[] = [];
    const commands = lines.map((line) => {
      if ("text" in line) {
        y -= line.gap ?? 18;
        return `BT /F1 ${line.size ?? 11} Tf 56 ${y} Td (${pdfText(line.text)}) Tj ET`;
      }
      if ("cells" in line) {
        const size = line.size ?? 9;
        y -= line.gap ?? 14;
        return line.cells.map((cell) => `BT /F1 ${size} Tf ${(cell.align === "right" ? cell.x - textWidth(cell.text, size) : cell.x).toFixed(1)} ${y} Td (${pdfText(cell.text)}) Tj ET`).join("\n");
      }
      const width = (line.image.width / line.image.height) * line.height;
      y -= (line.gap ?? 8) + line.height;
      const header = encoder.encode(`<< /Type /XObject /Subtype /Image /Width ${line.image.width} /Height ${line.image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${line.image.jpeg.length} >>\nstream\n`);
      const imageNumber = add([header, line.image.jpeg, encoder.encode("\nendstream")]);
      images.push(`/Im${imageNumber} ${imageNumber} 0 R`);
      return `q ${width.toFixed(1)} 0 0 ${line.height} 56 ${y} cm /Im${imageNumber} Do Q`;
    });
    const content = commands.join("\n");
    const contentNumber = add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    pageNumbers.push(
      add(`<< /Type /Page /Parent ${pageTree} 0 R /MediaBox [0 0 595 842] /Contents ${contentNumber} 0 R /Resources << /Font << /F1 ${font} 0 R >> /XObject << ${images.join(" ")} >> >> >>`),
    );
  }
  objects[pageTree - 1] = `<< /Type /Pages /Kids [${pageNumbers.map((n) => `${n} 0 R`).join(" ")}] /Count ${pages.length} >>`;

  // Write it out in bytes, recording where each object starts
  const chunks: Uint8Array[] = [encoder.encode("%PDF-1.4\n")];
  let length = chunks[0].length;
  const offsets: number[] = [];
  const push = (chunk: Uint8Array) => {
    chunks.push(chunk);
    length += chunk.length;
  };
  objects.forEach((object, index) => {
    offsets.push(length);
    push(encoder.encode(`${index + 1} 0 obj\n`));
    if (typeof object === "string") push(encoder.encode(object));
    else object.forEach(push);
    push(encoder.encode("\nendobj\n"));
  });
  const xrefOffset = length;
  const xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}`;
  push(encoder.encode(`${xref}trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`));
  return new Blob(chunks as BlobPart[], { type: "application/pdf" });
}
