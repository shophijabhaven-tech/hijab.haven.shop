import { Link } from 'react-router'

export default function NotFound() {
  return (
    <section className="min-h-[70vh] flex flex-col items-center justify-center text-center px-[5%] pt-24 pb-16">
      <p className="text-xs tracking-[0.18em] uppercase text-rose mb-3">✦ Hijab Haven</p>
      <h1 className="font-heading text-7xl text-mocha mb-2">404</h1>
      <p className="font-heading italic text-2xl text-mocha mb-3">This page has drifted away</p>
      <p className="text-sm text-warm mb-8">
        The page you're looking for doesn't exist or has been moved.
      </p>
      <Link
        to="/"
        className="bg-rose text-white px-7 py-3 rounded text-xs tracking-[0.15em] uppercase no-underline hover:bg-mocha transition-colors"
      >
        Back to Home
      </Link>
    </section>
  )
}
