/**
 * A readable name for a signed-in device. The backend stores the browser's own identification text
 * (for example "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 … Chrome/124.0 Safari/537.36"),
 * which is shown as "Chrome on Windows". Anything that isn't a browser's text is shown as it is.
 */
export function deviceName(userAgent: string): string {
  const text = userAgent.trim();
  if (!text) return "Unknown device";
  if (!/Mozilla\/|AppleWebKit|Gecko\//.test(text)) return text;
  // Order matters: Edge and Chrome on iPhone also say "Chrome" or "Safari"
  const browser = /Edg(e|A|iOS)?\//.test(text)
    ? "Edge"
    : /OPR\/|Opera/.test(text)
      ? "Opera"
      : /Firefox\/|FxiOS\//.test(text)
        ? "Firefox"
        : /Chrome\/|CriOS\//.test(text)
          ? "Chrome"
          : /Safari\//.test(text)
            ? "Safari"
            : "Browser";
  const system = /Android/.test(text)
    ? "Android"
    : /iPhone|iPad|iPod/.test(text)
      ? "iPhone or iPad"
      : /Windows/.test(text)
        ? "Windows"
        : /Mac OS X|Macintosh/.test(text)
          ? "Mac"
          : /Linux|X11/.test(text)
            ? "Linux"
            : "";
  return system ? `${browser} on ${system}` : browser;
}

/**
 * What to show as the place of a signed-in device. The backend stores the address the person connected from (for example "127.0.0.1"),
 * not a town, so an address is shown for what it is, and the computer's own or a home or office network address is named plainly.
 * Anything that is not an address is already a place name and is shown as it is.
 */
export function placeName(location: string): string {
  const text = location.trim();
  if (!text) return "Unknown place";
  const address = text.replace(/^::ffff:/i, "");
  const isV4 = /^\d{1,3}(\.\d{1,3}){3}$/.test(address);
  const isV6 = address.includes(":") && /^[0-9a-f:]+$/i.test(address);
  if (!isV4 && !isV6) return text;
  if (/^127\./.test(address) || address === "::1") return "This computer";
  if (/^(10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(address) || /^(fe80:|fc|fd)/i.test(address)) return "Same network";
  return `Address ${address}`;
}
