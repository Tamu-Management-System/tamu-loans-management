# Report PDF: design reference for the backend

`GET /reports/{name}/export?format=pdf` returns the report as a PDF. The demo draws it in `src/mocks/reportPdf.ts`
(with `src/mocks/pdfKit.ts`); the backend should produce the same layout. The data is the same `Report` object the screen uses.

**Page:** A4 portrait, 40 pt margins, Helvetica (Arial is fine). Colours are the app's: ink `#1B2430`, muted `#5B6470`,
lines `#E3E7ED`, cards white with a `#E3E7ED` border, table header `#EEF1F5`, primary `#2185F6`; chart colours `--chart-1..5` in `src/styles/tokens.css`.

**Every page:** a 5 pt blue bar at the top and a footer with the business name, "Confidential: contains client information" and
"Page X of Y". There is no running header (brand mark, business name, exported by): whoever downloads a report knows whose it is;
add one back only if the client asks. Pages after the first show "{Report} report · continued" and repeat the table header.

**Page one, top to bottom**
1. Title ("{Report} report", 22 pt bold) and a line with the dates and whose loans ("As of 9 Nov 2026" for Portfolio and Aged loans,
   "1 Nov 2026 to 9 Nov 2026" otherwise, then "Whole market" or "{name}'s portfolio").
2. The 3 or 4 headline figures as cards, all in one size (as large as the longest value allows), with the note under each. Amounts show "(UGX)" after the card title and plain numbers as the value.
3. The charts, side by side in cards: donuts with the total in the middle and a legend (name, value, share); columns with the value on
   top and the names below; trends as a line with a soft area (a dashed second line for the target, with a legend). Same data and
   colours as on screen (`ordered` donuts use the blue-then-light-to-dark-red palette). A chart with nothing in it says "Nothing in these dates."
4. The table: title with the row count; header row (small bold capitals, wraps to two lines, amounts say "(UGX)" in the heading and
   show plain numbers); light zebra rows; numbers right-aligned; text shortened with "…" rather than running into the next column; a
   totals row in bold.

**Rules that keep it clean**
- Measure text before placing it: never let a column's text run into the next one. Give columns the width their values need, let spare
  width go to text columns, and shorten text only when there is no room.
- A totals row never sits alone on a page: the last data row moves with it.
- A section that doesn't fit at the bottom of a page starts on the next one.
- Amounts keep thousands separators; percentages one decimal; dates as "9 Nov 2026".
- Never put a National ID, a password or a link token in a report.
- A cell that lists several items, joined with "; ", shows one item per line, and the row grows to fit.
- Tables with nine or more columns use a slightly smaller type (7.5 pt) so every column keeps its full text.
