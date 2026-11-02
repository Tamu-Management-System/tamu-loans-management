import { useId, useRef, useState } from "react";
import { Link } from "react-router";
import { useMyProfile, useRemoveMyPhoto, useUpdateMyPhone, useUploadMyPhoto } from "../../api/account";
import { ApiError } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { DATA_SCOPES, PERMISSION_CATALOG, PERMISSION_MODULES } from "../../auth/permissions";
import { Avatar } from "../../components/ui/Avatar";
import { Button } from "../../components/ui/Button";
import { useToast } from "../../components/ui/Toast";
import { formatRelativeDay } from "../../lib/format";
import { normalisePhone } from "../../lib/phone";
import styles from "./Account.module.css";

const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** My profile: your details, what your role lets you do, and your recent sign-ins. */
export function ProfilePage() {
  const { user } = useAuth();
  const { data: profile, isPending, isError, refetch } = useMyProfile();

  return (
    <>
      <div className={styles.header}>
        <h1>My profile</h1>
        <p className={styles.subtitle}>Your details, and what your role lets you do</p>
      </div>
      {isError ? (
        <div className={styles.card}>
          <p className={styles.message} role="alert">
            Your profile couldn't load.{" "}
            <button type="button" className={styles.linkButton} onClick={() => refetch()}>
              Try again
            </button>
          </p>
        </div>
      ) : isPending ? (
        <div className={styles.loading} aria-busy="true" aria-label="Loading your profile" />
      ) : (
        <div className={styles.columns}>
          <div className={styles.column}>
            <section className={styles.card} aria-labelledby="details-heading">
              <PhotoAndName name={profile.name} photoUrl={user.photoUrl} roleLine={`${profile.role.name} · ${profile.branch}`} />
              <h2 id="details-heading" className="sr-only">
                Your details
              </h2>
              <dl className={styles.rows}>
                <div>
                  <dt>Email</dt>
                  <dd>
                    {profile.email}
                    <span className={styles.hint}>You sign in with this. An admin can change it.</span>
                  </dd>
                </div>
                <PhoneRow phone={profile.phone} />
                <div>
                  <dt>Role</dt>
                  <dd>
                    {profile.role.name}
                    <span className={styles.hint}>Set by an admin.</span>
                  </dd>
                </div>
                <div>
                  <dt>Market</dt>
                  <dd>{profile.branch}</dd>
                </div>
              </dl>
            </section>

            <section className={styles.card} aria-labelledby="signins-heading">
              <div className={styles.cardHeader}>
                <h2 id="signins-heading">Recent sign-ins</h2>
                <Link to="/account/settings" className={styles.cardLink}>
                  Not you? Change your password
                </Link>
              </div>
              {profile.recentSignIns.length === 0 ? (
                <p className={styles.empty}>No sign-ins recorded yet.</p>
              ) : (
                <ul className={styles.list}>
                  {profile.recentSignIns.map((signIn, index) => (
                    <li key={index}>
                      <span>
                        <b>{capitalise(formatRelativeDay(signIn.at))}</b>
                        <span className={styles.hint}>{signIn.device}</span>
                      </span>
                      <span className={`${styles.chip} ${signIn.success ? styles.chipOk : styles.chipBad}`}>{signIn.success ? "Signed in" : "Wrong password"}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <section className={styles.card} aria-labelledby="access-heading">
            <div className={styles.cardHeader}>
              <h2 id="access-heading">What you can do</h2>
            </div>
            <p className={styles.scope}>
              <b>{DATA_SCOPES.find((scope) => scope.value === user.dataScope)!.label}:</b> {DATA_SCOPES.find((scope) => scope.value === user.dataScope)!.description}
            </p>
            <dl className={styles.access}>
              {PERMISSION_MODULES.map((module) => {
                const mine = PERMISSION_CATALOG.filter((info) => info.module === module.name && user.permissions.includes(info.id));
                if (mine.length === 0) return null;
                return (
                  <div key={module.name}>
                    <dt>{module.name}</dt>
                    <dd>
                      <ul>
                        {mine.map((info) => (
                          <li key={info.id}>{info.label}</li>
                        ))}
                      </ul>
                    </dd>
                  </div>
                );
              })}
            </dl>
            <p className={styles.hint}>Need to do something else? Ask an admin to change your role.</p>
          </section>
        </div>
      )}
    </>
  );
}

function PhotoAndName({ name, photoUrl, roleLine }: { name: string; photoUrl: string | null; roleLine: string }) {
  const showToast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const upload = useUploadMyPhoto();
  const remove = useRemoveMyPhoto();
  const busy = upload.isPending || remove.isPending;

  const choose = (file: File | undefined) => {
    if (!file) return;
    if (!["image/jpeg", "image/png"].includes(file.type)) return showToast({ message: "Use a JPEG or PNG photo." });
    if (file.size > MAX_PHOTO_BYTES) return showToast({ message: "The photo is larger than 2 MB." });
    upload
      .mutateAsync(file)
      .then(() => showToast({ message: "Photo updated." }))
      .catch((error) => showToast({ message: error instanceof ApiError ? error.message : "The photo couldn't be uploaded. Try again." }));
  };

  return (
    <div className={styles.identity}>
      <Avatar name={name} src={photoUrl} size={72} />
      <div className={styles.identityText}>
        <p className={styles.name}>{name}</p>
        <p className={styles.hint}>{roleLine}</p>
        <div className={styles.photoActions}>
          <input ref={input} type="file" accept="image/jpeg,image/png" hidden onChange={(event) => {
              choose(event.target.files?.[0]);
              event.target.value = "";
            }} aria-label="Choose a photo" />
          <button type="button" className={styles.textButton} onClick={() => input.current?.click()} disabled={busy}>
            {upload.isPending ? "Uploading…" : photoUrl ? "Change photo" : "Add photo"}
          </button>
          {photoUrl && (
            <button
              type="button"
              className={`${styles.textButton} ${styles.textButtonMuted}`}
              onClick={() => remove.mutateAsync().then(() => showToast({ message: "Photo removed." }))}
              disabled={busy}
            >
              Remove
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function PhoneRow({ phone }: { phone: string }) {
  const id = useId();
  const showToast = useToast();
  const update = useUpdateMyPhone();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(phone);
  const normalised = normalisePhone(value);

  const save = () => {
    if (!normalised) return;
    update
      .mutateAsync(normalised)
      .then(() => {
        setEditing(false);
        showToast({ message: "Phone number saved." });
      })
      .catch(() => undefined);
  };

  return (
    <div>
      <dt>{editing ? <label htmlFor={id}>Phone</label> : "Phone"}</dt>
      <dd>
        {editing ? (
          <form
            className={styles.inlineForm}
            onSubmit={(event) => {
              event.preventDefault();
              save();
            }}
          >
            <input id={id} className={styles.input} inputMode="tel" value={value} onChange={(event) => setValue(event.target.value)} autoFocus aria-invalid={!normalised} />
            <Button type="submit" size="small" disabled={!normalised || update.isPending}>
              {update.isPending ? "Saving…" : "Save"}
            </Button>
            <Button
              size="small"
              variant="secondary"
              onClick={() => {
                setEditing(false);
                setValue(phone);
                update.reset();
              }}
            >
              Cancel
            </Button>
            {(!normalised || update.error) && (
              <span className={styles.error} role="alert">
                {update.error instanceof ApiError ? update.error.message : "Enter a Ugandan mobile number, e.g. 0772 123 456."}
              </span>
            )}
          </form>
        ) : (
          <>
            {phone}
            <button type="button" className={styles.textButton} onClick={() => setEditing(true)}>
              Change
            </button>
            <span className={styles.hint}>Colleagues and admins use this to reach you.</span>
          </>
        )}
      </dd>
    </div>
  );
}
