import { Link } from "react-router";
import { useAuth } from "../auth/AuthContext";
import { ROUTABLE_NAV_ITEMS } from "../app/navigation";
import { Icon } from "../components/ui/Icon";
import styles from "./Pages.module.css";

/** Phones: every menu item the user can open, since the sidebar is hidden. */
export function MorePage() {
  const { can } = useAuth();
  return (
    <>
      <div className={styles.pageHeader}>
        <h1>Menu</h1>
      </div>
      <ul className={styles.menuList}>
        {ROUTABLE_NAV_ITEMS.filter((item) => !item.requires || can(item.requires)).map((item) => (
          <li key={item.to}>
            <Link to={item.to!}>
              <Icon name={item.icon} size={22} />
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
