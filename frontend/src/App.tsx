import { lazy, Suspense, useEffect } from 'react'
import { Link, Navigate, Route, Routes, useLocation } from 'react-router'

import { useMeta } from './api/queries'
import { Shell } from './components/Shell'
import { EmptyState, LoadingState } from './components/StateViews'
import { BriefingPage } from './pages/BriefingPage'

// The briefing is the landing view and ships in the main bundle; the rest load on demand.
const AccuracyPage = lazy(() =>
  import('./pages/AccuracyPage').then((m) => ({ default: m.AccuracyPage })),
)
const ExplorerPage = lazy(() =>
  import('./pages/ExplorerPage').then((m) => ({ default: m.ExplorerPage })),
)
const MethodologyPage = lazy(() =>
  import('./pages/MethodologyPage').then((m) => ({ default: m.MethodologyPage })),
)

const TITLES: Record<string, string> = {
  briefing: 'Briefing',
  accuracy: 'Accuracy report',
  explorer: 'Explorer',
  methodology: 'Methodology',
}

function DocumentTitle() {
  const { pathname } = useLocation()
  useEffect(() => {
    const section = TITLES[pathname.split('/')[1] ?? '']
    document.title = section ? `${section} · WindDesk` : 'WindDesk'
  }, [pathname])
  return null
}

function NotFound() {
  return (
    <>
      <EmptyState title="Page not found" text="This address does not match any WindDesk view." />
      <p style={{ textAlign: 'center' }}>
        <Link to="/briefing">Go to today&apos;s briefing</Link>
      </p>
    </>
  )
}

export function App() {
  const meta = useMeta()
  const { search } = useLocation()
  return (
    <Shell meta={meta.data}>
      <DocumentTitle />
      <Suspense fallback={<LoadingState label="Loading view" />}>
        <Routes>
          <Route path="/" element={<Navigate to={`/briefing${search}`} replace />} />
          <Route path="/briefing" element={<BriefingPage />} />
          <Route path="/briefing/:date" element={<BriefingPage />} />
          <Route path="/accuracy" element={<AccuracyPage />} />
          <Route path="/explorer" element={<ExplorerPage />} />
          <Route path="/methodology" element={<MethodologyPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </Shell>
  )
}
