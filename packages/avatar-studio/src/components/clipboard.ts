/* Clipboard writes fail in insecure contexts and some embeds: report, don't throw. */

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
