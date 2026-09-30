/** Posts alert payloads to ALERT_WEBHOOK_URL (HTTPS only). Failures are logged, never thrown. */
export async function postWebhook(payload: unknown) {
  const url = process.env.ALERT_WEBHOOK_URL;
  if (!url || !/^https:\/\//.test(url)) return;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: ctrl.signal });
    clearTimeout(t);
  } catch (e) {
    console.error("alert webhook failed", e instanceof Error ? e.message : e);
  }
}
