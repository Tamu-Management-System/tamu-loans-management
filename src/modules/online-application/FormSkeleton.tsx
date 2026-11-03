import type { CSSProperties } from "react";
import styles from "./OnlineApplication.module.css";

/**
 * Grey placeholders with the same box and block heights as the form's first page (index.html draws the same ones
 * before the app loads), so nothing moves when the real page appears. Lines marked `xs` only show on narrow screens,
 * where the text wraps onto more lines.
 */
export function FormSkeleton() {
  const bar = (width: string, height: number, extra: CSSProperties = {}) => <div className="sk" style={{ width, height, ...extra }} />;
  // One line of text: a block as tall as the real line, with a bar in it
  const line = (width: string, height: number, blockHeight: number, narrowOnly = false) => (
    <div className={narrowOnly ? "bk xs" : "bk"} style={{ height: blockHeight }}>
      {bar(width, height)}
    </div>
  );
  const row = (height: number, left: string, right: string, rightHeight = 15) => (
    <div className="boot-row" style={{ height }}>
      {bar(left, 13)}
      {bar(right, rightHeight)}
    </div>
  );
  return (
    <div className="boot-panel" aria-busy="true" aria-label="Opening your application">
      {line("64px", 12, 16)}
      <div className="bk bk-title" style={{ height: 30, marginTop: 6 }}>
        {bar("62%", 24)}
      </div>
      <div style={{ marginTop: 8 }}>
        {line("100%", 14, 23.3)}
        {line("94%", 14, 23.3)}
        {line("100%", 14, 23.3, true)}
        {line("55%", 14, 23.3)}
      </div>
      <div className="boot-terms">
        {row(38, "34%", "24%")}
        {row(39, "40%", "20%")}
        {row(42, "30%", "28%", 17)}
        {row(39, "22%", "32%")}
        {row(39, "28%", "26%")}
        {row(39, "26%", "30%")}
      </div>
      <div className="bk" style={{ height: 21, marginTop: 26 }}>
        {bar("36%", 17)}
      </div>
      <div style={{ marginTop: 8 }}>
        {line("88%", 14, 26)}
        {line("96%", 14, 26)}
        {line("40%", 14, 26)}
        {line("72%", 14, 26)}
        {line("84%", 14, 26, true)}
        {line("46%", 14, 26, true)}
      </div>
      {bar("100%", 50, { marginTop: 24, borderRadius: 14 })}
      <div style={{ marginTop: 16 }}>
        {line("100%", 12, 19)}
        {line("52%", 12, 19, true)}
      </div>
    </div>
  );
}

/**
 * The whole page around the placeholders: shown while the form's code loads (before the page itself can draw),
 * so the screen never goes blank between index.html's placeholders and the form's own.
 */
export function FormSkeletonPage() {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <FormSkeleton />
      </main>
    </div>
  );
}
