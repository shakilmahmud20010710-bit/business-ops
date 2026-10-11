import { useEffect, useState } from 'react'

/** Fetch on mount. Returns { data, error, hint, loading }. */
export function useAsync(fn, deps = []) {
  const [state, setState] = useState({ data: null, error: null, hint: null, loading: true })

  useEffect(() => {
    let cancelled = false
    setState({ data: null, error: null, hint: null, loading: true })
    fn()
      .then((data) => !cancelled && setState({ data, error: null, hint: null, loading: false }))
      .catch((e) => !cancelled && setState({ data: null, error: e.message, hint: e.hint, loading: false }))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return state
}
