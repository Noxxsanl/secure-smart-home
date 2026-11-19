type SkeletonProps = {
  className?: string;
};

// Shimmering placeholder used while a mock/SWR fetch is in flight so cards keep
// their final height and the layout doesn't jump when data lands.
export default function Skeleton({ className = "" }: SkeletonProps) {
  return <div className={`animate-pulse rounded bg-gray-100 dark:bg-slate-700 ${className}`} />;
}
