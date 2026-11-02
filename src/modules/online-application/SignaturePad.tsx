import { useEffect, useRef, useState } from "react";
import styles from "./OnlineApplication.module.css";

export interface DrawnSignature {
  blob: Blob;
  width: number;
  height: number;
}

interface SignaturePadProps {
  /** e.g. "Borrower's signature" */
  label: string;
  onChange: (signature: DrawnSignature | null) => void;
  invalid?: boolean;
}

const HEIGHT = 170;

/** Sign with a finger (or mouse). Exported as a JPEG on a white background, for the signed PDF. */
export function SignaturePad({ label, onChange, invalid = false }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  const paper = () => {
    const canvas = canvasRef.current!;
    const context = canvas.getContext("2d")!;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    const scale = window.devicePixelRatio || 1;
    context.setTransform(scale, 0, 0, scale, 0, 0);
    context.lineWidth = 2.4;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = "#111827";
  };

  useEffect(() => {
    const canvas = canvasRef.current!;
    const scale = window.devicePixelRatio || 1;
    canvas.width = Math.round(canvas.clientWidth * scale);
    canvas.height = Math.round(HEIGHT * scale);
    paper();
  }, []);

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const start = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = true;
    const context = event.currentTarget.getContext("2d")!;
    const { x, y } = point(event);
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + 0.1, y + 0.1); // a tap leaves a dot
    context.stroke();
  };
  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const context = event.currentTarget.getContext("2d")!;
    const { x, y } = point(event);
    context.lineTo(x, y);
    context.stroke();
  };
  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    setHasInk(true);
    const canvas = canvasRef.current!;
    canvas.toBlob((blob) => blob && onChange({ blob, width: canvas.width, height: canvas.height }), "image/jpeg", 0.85);
  };
  const clear = () => {
    paper();
    setHasInk(false);
    onChange(null);
  };

  return (
    <div className={styles.signature}>
      <div className={`${styles.signatureBox} ${invalid ? styles.signatureInvalid : ""}`}>
        <canvas
          ref={canvasRef}
          className={styles.signatureCanvas}
          style={{ height: HEIGHT }}
          aria-label={label}
          role="img"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
        />
        {!hasInk && (
          <span className={styles.signatureHint} aria-hidden="true">
            Sign here with your finger
          </span>
        )}
        <span className={styles.signatureLine} aria-hidden="true" />
      </div>
      <button type="button" className={styles.textButton} onClick={clear} disabled={!hasInk}>
        Clear and sign again
      </button>
    </div>
  );
}
