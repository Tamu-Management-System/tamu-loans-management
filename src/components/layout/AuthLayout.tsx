import { useEffect, useState, type ReactNode } from "react";
import { TamuLogoGlyph } from "../ui/Icon";
import styles from "../../pages/LoginPage.module.css";

// Every picture in src/images/login shows in turn (file-name order). Add or remove a file to change the set.
const SLIDES = Object.values(import.meta.glob<string>("../../images/login/*.{jpg,jpeg,png,webp}", { eager: true, import: "default" }));
// How long each picture stays up. Screen tuning, not a business rule.
const SLIDE_MS = 6000;

/** The brand panel's pictures, fading from one to the next. A single picture just stays; with reduced motion it does not change on its own. */
function BrandSlides() {
  const [current, setCurrent] = useState(0);
  useEffect(() => {
    if (SLIDES.length < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => {
      if (!document.hidden) setCurrent((index) => (index + 1) % SLIDES.length);
    }, SLIDE_MS);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className={styles.brandImage}>
      {SLIDES.map((src, index) => (
        <img key={src} className={`${styles.slide} ${index === current ? styles.slideShown : ""}`} src={src} alt="" loading={index === 0 ? "eager" : "lazy"} />
      ))}
      {SLIDES.length > 1 && (
        <div className={styles.slideDots} aria-hidden="true">
          {SLIDES.map((src, index) => (
            <span key={src} className={index === current ? styles.slideDotOn : ""} />
          ))}
        </div>
      )}
    </div>
  );
}

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
            <TamuLogoGlyph size={26} />
          </span>
          Tamu Loans
        </div>
        {/* Decorative: the tagline says what the product is */}
        <BrandSlides />
        <p className={styles.tagline}>Every amount, every repayment, in one place.</p>
        <p className={styles.brandFooter}>© {new Date().getFullYear()} Tamu Cleaning Services</p>
      </aside>

      <main className={styles.formPanel}>{children}</main>
    </div>
  );
}
