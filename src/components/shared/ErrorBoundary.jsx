import { Component } from 'react'

// Minimal error boundary — catches render errors from lazy-loaded panels (most likely cause:
// a dynamic import() failing, e.g. a stale tab trying to fetch a chunk whose hashed filename
// no longer exists after a new deploy) so a failure shows a recoverable message instead of an
// uncaught crash with a blank screen. React error boundaries must be class components — there's
// no hook equivalent for catching render errors. PortalShell keys this by `activePanel`, so
// navigating to a different panel after an error remounts it fresh rather than staying stuck.
export default class ErrorBoundary extends Component {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error) {
    console.error('Panel render error:', error)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-center px-4">
          <div className="text-[16px] font-semibold text-text">⚠️ Something went wrong.</div>
          <div className="text-[14.5px] text-text-muted">Please refresh the page and try again.</div>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-1 text-[14.5px] font-semibold text-primary border border-primary/30 rounded-md px-3.5 py-1.5"
          >
            Reload
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
