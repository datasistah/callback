import { Component } from 'react'

// Per-page error boundary. Catches render errors so a single broken screen
// never blanks the whole app.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.error('Page error boundary caught:', error, info)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="mx-auto max-w-xl px-6 py-24 text-center">
          <h1 className="text-2xl font-semibold text-ink">
            Something went wrong on this page
          </h1>
          <p className="mt-3 text-gray-600">
            {this.state.error?.message ||
              'An unexpected error occurred while rendering this screen.'}
          </p>
          <button
            onClick={this.handleReset}
            className="mt-6 rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-white hover:bg-accent-hover"
          >
            Try again
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
