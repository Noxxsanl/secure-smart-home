export default function Loading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F6F8FB] px-4 text-gray-900">
      <div className="rounded-2xl border border-[#E5EAF0] bg-white p-8 text-center shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Loading</p>
        <h1 className="mt-4 text-xl font-semibold text-gray-900">Preparing page...</h1>
      </div>
    </main>
  );
}
