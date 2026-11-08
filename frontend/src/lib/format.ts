const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", minimumFractionDigits: 2 });
const gbp0 = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });
const num = new Intl.NumberFormat("en-GB");

export const fmtGBP = (n: number) => gbp.format(n);
export const fmtGBP0 = (n: number) => gbp0.format(n);
export const fmtNum = (n: number) => num.format(n);
export const fmtRel = (n: number | null) => (n == null ? "—" : n.toFixed(3));
export const fmtPct = (n: number, dp = 1) => `${n > 0 ? "+" : ""}${n.toFixed(dp)}%`;

export function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}
export function fmtDateTime(iso: string) {
  return `${fmtDate(iso)}, ${new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })}`;
}
