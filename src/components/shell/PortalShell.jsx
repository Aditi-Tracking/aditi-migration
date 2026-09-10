import { useState } from 'react'
import { useTheme } from '../../hooks/useTheme'
import { FileViewerProvider } from '../../context/FileViewerContext'
import { NAV_ITEMS } from './navItems'
import Sidebar from './Sidebar'
import MobileHeader from './MobileHeader'
import BottomNav from './BottomNav'
import MobileMenuSheet from './MobileMenuSheet'
import UserSheet from './UserSheet'
import ProfileModal from './ProfileModal'
import GreetingToast from './GreetingToast'
import IdleWarningToast from './IdleWarningToast'
import FileViewerModal from '../shared/FileViewerModal'
import PlaceholderPanel from '../panels/PlaceholderPanel'
import HRPanel from '../panels/hr/HRPanel'
import SalesPanel from '../panels/sales/SalesPanel'

const PANEL_COMPONENTS = {
  hr: HRPanel,
  sales: SalesPanel,
}

const PANEL_LABELS = NAV_ITEMS.reduce((acc, item) => {
  acc[item.id] = item.label
  if (item.children) item.children.forEach((c) => (acc[c.id] = c.label))
  return acc
}, {})

export default function PortalShell() {
  const { theme, toggleTheme } = useTheme()
  const [activePanel, setActivePanel] = useState('home')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [userSheetOpen, setUserSheetOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)

  function navigate(id) {
    setActivePanel(id)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const ActivePanelComponent = PANEL_COMPONENTS[activePanel]

  return (
    <FileViewerProvider>
      <div className="min-h-screen flex bg-surface-2">
        <Sidebar
          activePanel={activePanel}
          onNavigate={navigate}
          theme={theme}
          onToggleTheme={toggleTheme}
          onOpenProfile={() => setProfileOpen(true)}
        />

        <MobileHeader theme={theme} onToggleTheme={toggleTheme} />

        <main className="flex-1 min-w-0 pt-[52px] md:pt-0 pb-16 md:pb-0">
          <div className="max-w-5xl mx-auto">
            {ActivePanelComponent ? (
              <ActivePanelComponent />
            ) : (
              <PlaceholderPanel label={PANEL_LABELS[activePanel] || activePanel} />
            )}
          </div>
        </main>

        <BottomNav
          activePanel={activePanel}
          onNavigate={navigate}
          onToggleMenu={() => setMobileMenuOpen(true)}
          onOpenUserSheet={() => setUserSheetOpen(true)}
        />

        <MobileMenuSheet
          open={mobileMenuOpen}
          activePanel={activePanel}
          onNavigate={navigate}
          onClose={() => setMobileMenuOpen(false)}
        />

        <UserSheet
          open={userSheetOpen}
          onClose={() => setUserSheetOpen(false)}
          onOpenProfile={() => setProfileOpen(true)}
        />

        <ProfileModal open={profileOpen} onClose={() => setProfileOpen(false)} />

        <GreetingToast />
        <IdleWarningToast />
        <FileViewerModal />
      </div>
    </FileViewerProvider>
  )
}
