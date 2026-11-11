import styles from "./Pages.module.css";

/** Stand-in for screens that haven't been built yet. */
export function PlaceholderPage({ title }: { title: string }) {
  return (
    <>
      <div className={styles.pageHeader}>
        <h1>{title}</h1>
      </div>
      <div className={styles.notice}>This screen comes next.</div>
    </>
  );
}

export function ForbiddenPage() {
  return (
    <>
      <div className={styles.pageHeader}>
        <h1>No access</h1>
      </div>
      <div className={styles.notice}>Your role doesn't include access to this screen. Ask an admin if you need it.</div>
    </>
  );
}

export function NotFoundPage() {
  return (
    <>
      <div className={styles.pageHeader}>
        <h1>Page not found</h1>
      </div>
      <div className={styles.notice}>This page doesn't exist. Use the menu to find what you need.</div>
    </>
  );
}
