export function DemoNotice({ what }: { what: string }) {
  if (process.env.DATA_MODE !== "demo") return null;
  return (
    <div className="rounded-[10px] border border-line bg-surface p-3 text-sm" style={{ borderColor: "var(--demo)" }}>
      <strong style={{ color: "var(--demo)" }}>Synthetic data:</strong> in demo mode the series are generated from a latent factor that is keyed to the NBER dates
      themselves, so these {what} results are circular and meaningless. They only demonstrate the mechanics.
    </div>
  );
}
