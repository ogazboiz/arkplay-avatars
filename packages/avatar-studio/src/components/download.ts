/* Saving a Blob as a file from the page (the user asked for it by pressing a button). */

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Some browsers start the download asynchronously: keep the URL alive for a moment.
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}
