export default function LoadingSpinner({ fullPage = false }: { fullPage?: boolean }) {
  const spinner = (
    <div
      className="w-10 h-10 rounded-full border-[3px] border-blush border-t-rose animate-spin-slow"
      role="status"
      aria-label="Loading"
    />
  )
  if (fullPage) {
    return <div className="min-h-screen flex items-center justify-center bg-cream">{spinner}</div>
  }
  return <div className="flex items-center justify-center py-12">{spinner}</div>
}
