type ConfirmDialogProps = {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null
  return (
    <>
      <div className="fixed inset-0 z-[950] bg-mocha/55" onClick={onCancel} />
      <div
        role="dialog"
        aria-modal="true"
        className="fixed z-[951] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] max-w-sm bg-cream rounded-md p-6 shadow-2xl animate-pop-in"
      >
        <h3 className="font-heading text-xl text-mocha mb-2">{title}</h3>
        <p className="text-sm text-warm leading-relaxed mb-5">{message}</p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="bg-transparent border border-sand text-warm px-4 py-2 text-xs tracking-[0.12em] uppercase rounded cursor-pointer hover:bg-sand/40 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="bg-rose text-white border-none px-4 py-2 text-xs tracking-[0.12em] uppercase rounded cursor-pointer hover:bg-mocha transition-colors"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </>
  )
}
