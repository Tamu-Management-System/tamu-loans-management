import { useId, useState } from "react";
import { Icon } from "../../components/ui/Icon";
import styles from "./ApplicationFields.module.css";

export interface IdPhoto {
  blob: Blob;
  previewUrl: string;
}

const MAX_SIDE = 1600;

/**
 * Re-draws the photo smaller as a JPEG: phone photos are often 5–10 MB, and re-drawing also drops
 * hidden photo data (such as the location it was taken).
 */
async function preparePhoto(file: File): Promise<IdPhoto> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
  if (!blob) throw new Error("photo");
  return { blob, previewUrl: URL.createObjectURL(blob) };
}

interface IdPhotoInputProps {
  label: string;
  value: IdPhoto | null;
  onChange: (photo: IdPhoto | null) => void;
  error?: string;
}

/** Take (or choose) a photo of one side of the National ID. The form releases the previews when it closes. */
export function IdPhotoInput({ label, value, onChange, error }: IdPhotoInputProps) {
  const id = useId();
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const choose = async (file: File | undefined) => {
    if (!file) return;
    setProblem(null);
    setBusy(true);
    try {
      const photo = await preparePhoto(file);
      if (value) URL.revokeObjectURL(value.previewUrl); // the old preview isn't needed any more
      onChange(photo);
    } catch {
      setProblem("This photo couldn't be read. Take it again.");
    } finally {
      setBusy(false);
    }
  };

  const message = problem ?? error;
  return (
    <div className={styles.photoField}>
      <span className={styles.photoLabel}>{label}</span>
      <label htmlFor={id} className={`${styles.photoBox} ${message ? styles.photoBoxInvalid : ""}`}>
        {value ? (
          <img src={value.previewUrl} alt={label} className={styles.photoPreview} />
        ) : (
          <span className={styles.photoEmpty}>
            <Icon name="image" size={24} strokeWidth={1.7} />
            {busy ? "Preparing photo…" : "Take a photo"}
          </span>
        )}
        <input id={id} type="file" accept="image/*" capture="environment" className={styles.fileInput} onChange={(event) => void choose(event.target.files?.[0])} />
      </label>
      {value && (
        <label htmlFor={id} className={styles.textButton}>
          Retake photo
        </label>
      )}
      {message && <span className={styles.fieldError}>{message}</span>}
    </div>
  );
}
