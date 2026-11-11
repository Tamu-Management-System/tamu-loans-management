import type { NotificationChannel, RepaymentSchedule } from "../../api/types";
import { SETTING_LIMITS } from "../../lib/settingLimits";
import { useAuth } from "../../auth/AuthContext";
import { NumberField, SettingRow, SettingsForm, SettingsGroup, Switch } from "./SettingsForm";
import { useSettingsDraft } from "./useSettingsDraft";
import styles from "./Settings.module.css";

const FREQUENCIES: { value: RepaymentSchedule; label: string }[] = [
  { value: "daily", label: "Clients who pay daily" },
  { value: "weekly", label: "Clients who pay weekly" },
  { value: "monthly", label: "Clients who pay monthly" },
];

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
  const texts = draft.values?.clientMessages;

  const toggle = (event: string, channel: NotificationChannel) =>
    draft.set(
      "rules",
      rules!.map((rule) => (rule.event !== event ? rule : { ...rule, channels: CHANNELS.map((c) => c.value).filter((c) => (c === channel ? !rule.channels.includes(c) : rule.channels.includes(c))) })),
    );

  return (
    <SettingsForm
      title="Notifications"
      subtitle="Tell the next person as soon as a step is ready for them, and keep clients informed"
      draft={draft as never}
      canEdit={canEdit}
      validate={() =>
        texts && FREQUENCIES.some(({ value }) => !Number.isInteger(texts.reminderDaysBefore[value]) || texts.reminderDaysBefore[value] < SETTING_LIMITS.reminderDaysBefore[0] || texts.reminderDaysBefore[value] > SETTING_LIMITS.reminderDaysBefore[1])
          ? `Reminder days: ${SETTING_LIMITS.reminderDaysBefore[0]} to ${SETTING_LIMITS.reminderDaysBefore[1]}.`
          : null
      }
    >
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
      {texts && (
        <>
          <SettingsGroup title="Texts to clients" description="Sent to the client's own phone by SMS. Every text is also kept on the loan page.">
            {texts.rules.map((rule) => (
              <SettingRow key={rule.event} label={rule.title} description="Goes to: the client.">
                <div className={styles.notifyControl}>
                  <Switch
                    label={rule.enabled ? "On" : "Off"}
                    checked={rule.enabled}
                    onChange={(enabled) => draft.set("clientMessages", { ...texts, rules: texts.rules.map((item) => (item.event === rule.event ? { ...item, enabled } : item)) })}
                  />
                  <p className={styles.example}>{rule.example}</p>
                </div>
              </SettingRow>
            ))}
          </SettingsGroup>
          <SettingsGroup title="Payment reminders" description="How long before a payment is due the reminder goes, by how the client repays. 0 sends it on the day.">
            {FREQUENCIES.map(({ value, label }) => (
              <SettingRow key={value} label={label} htmlFor={`reminder-${value}`}>
                <NumberField
                  id={`reminder-${value}`}
                  value={texts.reminderDaysBefore[value]}
                  onChange={(days) => draft.set("clientMessages", { ...texts, reminderDaysBefore: { ...texts.reminderDaysBefore, [value]: days } })}
                  min={SETTING_LIMITS.reminderDaysBefore[0]}
                  max={SETTING_LIMITS.reminderDaysBefore[1]}
                  unit="days before"
                />
              </SettingRow>
            ))}
          </SettingsGroup>
        </>
      )}
    </SettingsForm>
  );
}
