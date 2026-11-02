/** Hands a downloaded file (e.g. a PDF from the API) to the browser to save. */
export function saveFile(file: Blob, fileName: string) {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  // Release the copy in memory once the browser has started the download
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
