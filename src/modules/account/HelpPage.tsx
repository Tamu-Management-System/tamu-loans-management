import { useId, useState } from "react";
import { useSupportContacts } from "../../api/account";
import { useAuth } from "../../auth/AuthContext";
import type { Permission } from "../../auth/permissions";
import { Icon } from "../../components/ui/Icon";
import styles from "./Account.module.css";

type Topic = "Getting started" | "Applications" | "Payments" | "Loans and recovery" | "Your account";
const TOPICS: Topic[] = ["Getting started", "Applications", "Payments", "Loans and recovery", "Your account"];

interface Answer {
  topic: Topic;
  question: string;
  answer: string;
  /** Shown only to people who can do it */
  requires?: Permission;
}

const ANSWERS: Answer[] = [
  { topic: "Getting started", question: "What's on my dashboard?", answer: "Today's work: payments due, follow-ups and anything waiting for you. Work through the list from the top; each row has the next step." },
  { topic: "Getting started", question: "How do I find a borrower or loan?", answer: "Use the search at the top of every page: type a name, phone number, loan ID (TL-…) or application ID (APP-…)." },
  { topic: "Getting started", question: "Why can't I see some menus or buttons?", answer: "You see what your role allows. If you need more, ask an admin to change your role. My profile lists what you can do." },
  { topic: "Applications", question: "How do I start a loan application?", answer: "Applications → New application. Find the borrower (or add someone new), choose the loan product and amount, then either type in the signed paper forms and upload them as one PDF, or send the borrower an online link.", requires: "applications.create" },
  { topic: "Applications", question: "How does the online link work?", answer: "Create the application with “Online link”, copy the link and send it by WhatsApp or SMS. The borrower fills in their details and both guarantors', and all three sign on the phone. The link works once and stops after it's submitted.", requires: "applications.onlineLink" },
  { topic: "Applications", question: "Why can't I approve an application I started?", answer: "Two people must agree before money moves: whoever starts an application can't approve it. Someone else with permission to approve checks it." },
  { topic: "Applications", question: "An application was sent back to me. What now?", answer: "Open it from Applications → Drafts. The reason is at the top. Fix what's asked (for example a clearer scan) and submit it again.", requires: "applications.create" },
  { topic: "Payments", question: "How do I record a repayment?", answer: "Record payment (on the dashboard, Payments page or the loan). Choose the borrower, the amount and how it was paid. For mobile money, enter the transaction ID from the message.", requires: "payments.record" },
  { topic: "Payments", question: "I entered a payment wrongly. Can I change it?", answer: "Payments can't be edited or deleted, so the records stay honest. Tell Finance or an admin with the loan ID and what went wrong." },
  { topic: "Loans and recovery", question: "How do I pay out an approved loan?", answer: "Loans → To disburse. Send the money from Tamu's mobile money account first, then record the payout with the transaction ID. The repayment schedule starts from the payout date.", requires: "loans.disburse" },
  { topic: "Loans and recovery", question: "Why can't I pay out a loan I approved?", answer: "The approver and the person paying out must be different people. Ask a colleague who can pay out." },
  { topic: "Loans and recovery", question: "When does a loan go to recovery?", answer: "Someone with permission can send a late loan to the recovery team with a reason. Your admin may also have set loans to be suggested for recovery, or sent automatically, after a number of days late." },
  { topic: "Your account", question: "I forgot my password.", answer: "Ask an admin to send you a reset link. For your safety, passwords can't be reset without them." },
  { topic: "Your account", question: "Why was I signed out?", answer: "You're signed out automatically after a while without activity, so nobody else can see borrowers' details on an unattended screen. Sign in again to carry on." },
  { topic: "Your account", question: "Someone else may know my password.", answer: "Change it now in Account settings, then use “Sign out everywhere else”. Tell an admin too; they can check the audit log." },
];

/** Help & support: answers to common questions (only what your role can do), and who to contact. */
export function HelpPage() {
  const { can } = useAuth();
  const searchId = useId();
  const { data: contacts } = useSupportContacts();
  const [topic, setTopic] = useState<Topic | null>(null);
  const [query, setQuery] = useState("");

  const needle = query.trim().toLowerCase();
  const answers = ANSWERS.filter((item) => (!item.requires || can(item.requires)) && (!topic || item.topic === topic) && (!needle || `${item.question} ${item.answer}`.toLowerCase().includes(needle)));

  return (
    <>
      <div className={styles.header}>
        <h1>Help & support</h1>
        <p className={styles.subtitle}>Answers to common questions, and who to ask</p>
      </div>
      <div className={styles.helpLayout}>
        <section className={styles.card} aria-labelledby="answers-heading">
          <h2 id="answers-heading" className="sr-only">
            Answers
          </h2>
          <label className={styles.search} htmlFor={searchId}>
            <Icon name="search" size={17} strokeWidth={1.8} />
            <input id={searchId} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search help, e.g. payout, password" aria-label="Search help" autoComplete="off" />
          </label>
          <div className={styles.pills} role="group" aria-label="Topic">
            <button type="button" aria-pressed={!topic} onClick={() => setTopic(null)}>
              All
            </button>
            {TOPICS.map((item) => (
              <button key={item} type="button" aria-pressed={topic === item} onClick={() => setTopic(item)}>
                {item}
              </button>
            ))}
          </div>
          {answers.length === 0 ? (
            <p className={styles.message}>Nothing matches. Try other words, or ask an admin.</p>
          ) : (
            <div className={styles.faq}>
              {answers.map((item) => (
                <details key={item.question}>
                  <summary>
                    {item.question}
                    <Icon name="chevronDown" size={16} strokeWidth={2} className={styles.faqChevron} />
                  </summary>
                  <p>{item.answer}</p>
                </details>
              ))}
            </div>
          )}
        </section>

        <aside className={styles.card} aria-labelledby="contact-heading">
          <div className={styles.cardHeader}>
            <h2 id="contact-heading">Contact</h2>
          </div>
          <p className={styles.text}>For your account and roles, ask an admin. For technical problems, contact KadoshDev.</p>
          <ul className={styles.contacts}>
            {contacts?.admins.map((admin) => (
              <li key={admin.email}>
                <b>{admin.name}</b>
                <span className={styles.hint}>Admin</span>
                <a href={`tel:${admin.phone.replace(/\s/g, "")}`}>{admin.phone}</a>
                <a href={`mailto:${admin.email}`}>{admin.email}</a>
              </li>
            ))}
            {contacts && (
              <li>
                <b>{contacts.technical.name}</b>
                <span className={styles.hint}>If something in the system isn't working</span>
                {contacts.technical.phones.map((number) => (
                  <a key={number} href={`tel:${number.replace(/\s/g, "")}`}>
                    {number}
                  </a>
                ))}
                <a href={`mailto:${contacts.technical.email}`}>{contacts.technical.email}</a>
              </li>
            )}
            {contacts && (
              <li>
                <b>{contacts.business.name}</b>
                <span className={styles.hint}>Office</span>
                <a href={`tel:${contacts.business.phone.replace(/\s/g, "")}`}>{contacts.business.phone}</a>
                <a href={`mailto:${contacts.business.email}`}>{contacts.business.email}</a>
              </li>
            )}
          </ul>
          <p className={styles.hint}>Reporting a problem? Say what you were doing and roughly when. It helps your admin find it quickly.</p>
        </aside>
      </div>
    </>
  );
}
