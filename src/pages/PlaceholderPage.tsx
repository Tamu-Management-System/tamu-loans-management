import type { ReactNode } from "react";
import { useNavigate } from "react-router";
import { useSupportContacts } from "../api/account";
import { useAuth } from "../auth/AuthContext";
import { Icon } from "../components/ui/Icon";
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

/**
 * Shown instead of a screen the person's role doesn't include. Opened from a link or the address bar, since the menu only lists
 * what a role can open. Says which screen and who can change the role.
 */
export function ForbiddenPage({ screen }: { screen?: string }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: contacts } = useSupportContacts();
  const admins = contacts?.admins.slice(0, 3) ?? [];
  const contactList = admins.length > 0 && (
    <ul className={styles.adminList}>
      {admins.map((admin) => (
        <li key={admin.email}>
          <b>{admin.name}</b> (Admin)
          <span>
            <a href={`tel:${admin.phone.replace(/\s/g, "")}`}>{admin.phone}</a>
            <a href={`mailto:${admin.email}`}>{admin.email}</a>
          </span>
        </li>
      ))}
    </ul>
  );
  const questions: { question: string; answer?: string; content?: ReactNode }[] = [
    { question: "Why can't I open this screen?", answer: "Each role only opens what its job needs. That keeps clients' details, money and settings with the people who handle them." },
    { question: "Is something wrong with my account?", answer: "No. Your account works as normal. Only this screen is closed to your role, and everything else you do is unchanged." },
    { question: "Why isn't it in my menu?", answer: "The menu only lists the screens your role can open. A screen you can't see there is closed to your role, and opening its address directly leads here." },
    { question: "Can I get access to just this screen?", answer: "Access is given to a role one permission at a time, so an admin can add only what you need, or move you to a role that already has it." },
    { question: "Who decides what a role can open?", answer: "Your admins, in Settings. They can also create a role with exactly the access a job needs." },
    {
      question: "What should I tell the admin?",
      answer: `Say you were trying to open ${screen ?? "this screen"}, and what you needed to do there. That helps them give your role the right access and no more.`,
    },
    ...(contactList ? [{ question: "Need it for your work? Ask an admin to change your role", content: contactList }] : []),
  ];
  return (
    <>
      <section className={styles.restricted} aria-labelledby="restricted-heading">
        <Icon name="shield" size={220} strokeWidth={0.6} className={styles.restrictedMark} />
        <p className={styles.eyebrow}>Restricted</p>
        <h1 id="restricted-heading">{screen ? `${screen} isn't open to your role` : "This screen isn't open to your role"}</h1>
        <p className={styles.restrictedText}>
          You're signed in as <b>{user.role.name}</b>. Roles decide who sees what, so this one stays closed to you. Your account itself is fine.
        </p>
        <div className={styles.restrictedActions}>
          <button type="button" className={styles.lightButton} onClick={() => navigate("/", { replace: true })}>
            Go to dashboard
          </button>
          <button type="button" className={styles.ghostButton} onClick={() => navigate(-1)}>
            Go back
          </button>
        </div>
      </section>
      <div className={styles.questions} aria-label="Questions about this screen">
        {questions.map((item) => (
          <details key={item.question}>
            <summary>
              {item.question}
              <Icon name="chevronDown" size={16} strokeWidth={2} className={styles.questionChevron} />
            </summary>
            {item.content ?? <p>{item.answer}</p>}
          </details>
        ))}
      </div>
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
