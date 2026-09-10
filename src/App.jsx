import { AuthProvider, useAuth } from './context/AuthContext'
import LoginPage from './components/LoginPage'
import PortalShell from './components/shell/PortalShell'

function AppContent() {
  const { currentUser } = useAuth()
  return currentUser ? <PortalShell /> : <LoginPage />
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}

export default App
