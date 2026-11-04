import type { ReactNode } from "react";
import { TamuLogoMark } from "../ui/Icon";
import brandImage from "../../images/login-brand-panel.jpeg";
import styles from "../../pages/LoginPage.module.css";

/**
 * The page around the sign-in form and the "Set your password" page: brand panel on the left, the form on the
 * right. Phones: the brand panel becomes a short header above the form.
 */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.page}>
      <aside className={styles.brand}>
        <div className={styles.brandName}>
          <span className={styles.brandMark}>
            <TamuLogoMark size={24} />
          </span>
          Tamu Loans
        </div>
        {/* Decorative: the tagline says what the product is */}
        <img className={styles.brandImage} src={brandImage} alt="" />
        <p className={styles.tagline}>Every loan, every repayment, in one place.</p>
        <p className={styles.brandFooter}>© {new Date().getFullYear()} Tamu Cleaning Services</p>
      </aside>

      <main className={styles.formPanel}>{children}</main>
    </div>
  );
}
