export default function FullPageSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas dark:bg-slate-900">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-brand dark:border-slate-700 dark:border-t-brand" />
    </div>
  );
}
