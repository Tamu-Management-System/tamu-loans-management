import type { NotificationChannel } from "../../api/types";
import { useAuth } from "../../auth/AuthContext";
import { SettingRow, SettingsForm, SettingsGroup } from "./SettingsForm";
import { useSettingsDraft } from "./useSettingsDraft";
import styles from "./Settings.module.css";

const CHANNELS: { value: NotificationChannel; label: string }[] = [
  { value: "sms", label: "SMS" },
  { value: "email", label: "Email" },
];

/** Settings → Notifications: when a step is ready for the next person, how they're told (the bell always shows it). */
export function NotificationsSection() {
  const { can } = useAuth();
  const draft = useSettingsDraft("notifications");
  const rules = draft.values?.rules;
  const canEdit = can("settings.notifications");

  const toggle = (event: string, channel: NotificationChannel) =>
    draft.set(
      "rules",
      rules!.map((rule) => (rule.event !== event ? rule : { ...rule, channels: CHANNELS.map((c) => c.value).filter((c) => (c === channel ? !rule.channels.includes(c) : rule.channels.includes(c))) })),
    );

  return (
    <SettingsForm title="Notifications" subtitle="Tell the next person as soon as a step is ready for them" draft={draft as never} canEdit={canEdit}>
      {rules && (
        <SettingsGroup
          title="From onboarding to payout"
          description="Each step below tells the next person on the flow. Everyone always sees it in the bell and on their dashboard; choose what else is sent."
        >
          {rules.map((rule) => (
            <SettingRow key={rule.event} label={rule.title} description={`Goes to: ${rule.who}.`}>
              <div className={styles.notifyControl}>
                <div className={styles.channels} role="group" aria-label={`Send "${rule.title}" by`}>
                  {CHANNELS.map((channel) => (
                    <button
                      key={channel.value}
                      type="button"
                      className={styles.channel}
                      aria-pressed={rule.channels.includes(channel.value)}
                      disabled={!canEdit}
                      onClick={() => toggle(rule.event, channel.value)}
                    >
                      {channel.label}
                    </button>
                  ))}
                </div>
                <p className={styles.example}>{rule.example}</p>
              </div>
            </SettingRow>
          ))}
        </SettingsGroup>
      )}
    </SettingsForm>
  );
}
