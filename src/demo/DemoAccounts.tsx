// TEMPORARY: demo accounts on the login screen, for client presentations. Removed with the mock API.
import { DEMO_PASSWORD, roles, users } from "../mocks/fixtures";
import styles from "./DemoAccounts.module.css";


export function DemoAccounts({ onPick }: { onPick: (email: string, password: string) => void }) {
  return (
    <section className={styles.box} aria-label="Demo accounts">
      <p className={styles.title}>
        Demo accounts <span>Temporary · password {DEMO_PASSWORD}</span>
      </p>
      <div className={styles.accounts}>
        {users.map((user) => (
          <button key={user.id} type="button" onClick={() => onPick(user.email, DEMO_PASSWORD)}>
            <b>{roles[user.roleId]?.name}</b>
            <span>{user.email}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
