import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import FluxfeedSignals from './pages/FluxfeedSignals'
import Login from './components/Auth/Login'
import Register from './components/Auth/Register'

// Protected route wrapper
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-zinc-400">Loading...</div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/auth/login" replace />
  }

  return <>{children}</>
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Root redirects to app if logged in, otherwise to login */}
          <Route path="/" element={<Navigate to="/app" replace />} />
          
          {/* Auth routes */}
          <Route path="/auth/login" element={<Login />} />
          <Route path="/auth/register" element={<Register />} />
          
          {/* App route (protected) */}
          <Route
            path="/app"
            element={
              <ProtectedRoute>
                <FluxfeedSignals />
              </ProtectedRoute>
            }
          />
          
          {/* Catch all - redirect to app */}
          <Route path="*" element={<Navigate to="/app" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
