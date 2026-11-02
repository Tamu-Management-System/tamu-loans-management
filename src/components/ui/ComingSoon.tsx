import type { ReactNode } from "react";
import { useFeatureFlags } from "../../app/featureFlags";
import styles from "./ComingSoon.module.css";

interface ComingSoonProps {
  /** What the feature is, e.g. "Risk alerts" */
  feature: string;
  /** Where it comes from, e.g. "Module 3 · Arrears engine" */
  module: string;
  /** Smaller badge for tight spaces such as the sidebar */
  compact?: boolean;
  className?: string;
  children: ReactNode;
}

/**
 * Wraps a Phase 2 feature. Unless "show upcoming modules" is on, the content is
 * blurred behind a frosted "Coming soon" panel and can't be clicked or tabbed into.
 */
export function ComingSoon({ feature, module, compact = false, className = "", children }: ComingSoonProps) {
  const { showUpcomingModules } = useFeatureFlags();
  // Same structure either way, so the content keeps its size and place in the layout
  if (showUpcomingModules)
    return (
      <div className={`${styles.wrapper} ${className}`}>
        <div className={styles.content}>{children}</div>
      </div>
    );

  return (
    <div className={`${styles.wrapper} ${className}`}>
      <div className={styles.content} inert>
        {children}
      </div>
      <div className={`${styles.overlay} ${compact ? styles.compact : ""}`}>
        <span className={styles.badge}>Coming soon · Phase 2</span>
        <b>{feature}</b>
        <span className={styles.module}>{module}</span>
      </div>
    </div>
  );
}
