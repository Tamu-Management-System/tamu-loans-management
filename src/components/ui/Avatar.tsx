import { useState } from "react";
import { initials } from "../../lib/format";
import styles from "./Avatar.module.css";

/** Photo with initials underneath; if the photo fails to load, the initials show. */
export function Avatar({ name, src, size = 34 }: { name: string; src?: string | null; size?: number }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className={styles.avatar} style={{ width: size, height: size, fontSize: size >= 40 ? 12 : 11 }}>
      {initials(name)}
      {src && !failed && <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} />}
    </span>
  );
}
