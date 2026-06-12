type ErrorBlockProps = {
  message: string
  onRetry: () => void
}

/** §9.1 error state: message + Retry button that re-invokes the failed fetch. */
export default function ErrorBlock({ message, onRetry }: ErrorBlockProps) {
  return (
    <div className="text-center py-12 px-[5%]">
      <div className="text-4xl mb-3">🌸</div>
      <p className="text-sm text-warm leading-relaxed mb-5">{message}</p>
      <button
        onClick={onRetry}
        className="bg-rose text-white border-none px-7 py-2.5 text-xs tracking-[0.15em] uppercase rounded cursor-pointer hover:bg-mocha transition-colors"
      >
        Retry
      </button>
    </div>
  )
}
