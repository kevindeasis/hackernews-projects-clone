export default function StatusDot({ status, paused }: { status: string; paused?: boolean }) {
  const s = paused ? "paused" : status;
  return <span className={`dot dot-${s}`} title={s} />;
}
