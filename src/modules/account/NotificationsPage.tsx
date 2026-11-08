import { Link, useSearchParams } from "react-router";
import { useNotificationHistory } from "../../api/shell";
import type { MessageChannel } from "../../api/types";
import { Pagination } from "../../components/ui/Pagination";
import { formatDate, formatTime } from "../../lib/format";
import styles from "./Notifications.module.css";
import account from "./Account.module.css";

const CHANNELS: { value: MessageChannel | null; label: string }[] = [
  { value: null, label: "All" },
  { value: "in-app", label: "In-app" },
  { value: "sms", label: "SMS" },
  { value: "email", label: "Email" },
];
const CHANNEL_LABEL: Record<MessageChannel, string> = { "in-app": "In-app", sms: "SMS", email: "Email" };

/** Notifications: every message you were sent when a step was ready for you, by the bell, SMS or email. */
export function NotificationsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const channelParam = searchParams.get("channel") as MessageChannel | null;
  const channel = CHANNELS.some((item) => item.value === channelParam) ? channelParam : null;
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const { data, isPending, isError, refetch } = useNotificationHistory(channel, page);

  const update = (changes: Record<string, string | null>) =>
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      Object.entries(changes).forEach(([key, value]) => (value ? next.set(key, value) : next.delete(key)));
      return next;
    });

  return (
    <>
      <div className={account.header}>
        <h1>Notifications</h1>
        <p className={account.subtitle}>What you were told when a step was ready for you</p>
      </div>

      <section className={account.card} aria-label="Notifications">
        <div className={styles.tabs} role="group" aria-label="Show">
          {CHANNELS.map((item) => (
            <button key={item.label} type="button" aria-pressed={channel === item.value} onClick={() => update({ channel: item.value, page: null })}>
              {item.label}
              {data && <span className={styles.count}>{data.counts[item.value ?? "all"]}</span>}
            </button>
          ))}
        </div>

        {isError ? (
          <p className={account.message} role="alert">
            Your notifications couldn't load.{" "}
            <button type="button" className={account.linkButton} onClick={() => refetch()}>
              Try again
            </button>
          </p>
        ) : isPending ? (
          <div className={account.loading} aria-busy="true" aria-label="Loading your notifications" />
        ) : data.items.length === 0 ? (
          <p className={account.message}>{channel ? `No ${CHANNEL_LABEL[channel]} messages yet.` : "Nothing yet. You'll see a message here when a step is ready for you."}</p>
        ) : (
          <ul className={styles.list}>
            {data.items.map((item) => (
              <li key={item.id} className={styles.item}>
                <div className={styles.itemHead}>
                  <Link to={item.href} className={styles.title}>
                    {item.title}
                  </Link>
                  <time dateTime={item.at}>
                    {formatDate(item.at)}, {formatTime(item.at)}
                  </time>
                </div>
                <p className={styles.message}>{item.message}</p>
                <div className={styles.meta}>
                  <span className={styles.channel}>{CHANNEL_LABEL[item.channel]}</span>
                  {item.delivery === "sent" && <span className={styles.ok}>Sent</span>}
                  {item.delivery === "failed" && <span className={styles.bad}>Didn't reach you</span>}
                </div>
              </li>
            ))}
          </ul>
        )}

        {data && data.total > data.pageSize && (
          <Pagination page={data.page} pageSize={data.pageSize} total={data.total} noun="messages" onPageChange={(next) => update({ page: next > 1 ? String(next) : null })} />
        )}
      </section>
    </>
  );
}
