type Props = { height?: string };
export default function SkeletonBlock({ height = "h-20" }: Props) {
  return (
    <div className={`animate-pulse bg-slate-100 rounded-xl ${height}`} />
  );
}