import { useState } from 'react'
import { useTheme } from '../../hooks/useTheme'
import { useAuth } from '../../context/AuthContext'
import { FileViewerProvider } from '../../context/FileViewerContext'
import { CelebrationsProvider } from '../../context/CelebrationsContext'
import { TaskChecklistNavProvider } from '../../context/TaskChecklistNavContext'
import { trackPageSwitch } from '../../lib/activityTracking'
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
import CelebrationWishPopup from '../panels/home/CelebrationWishPopup'
import MyWishesModal from '../panels/home/MyWishesModal'
import PlaceholderPanel from '../panels/PlaceholderPanel'
import HRPanel from '../panels/hr/HRPanel'
import SalesPanel from '../panels/sales/SalesPanel'
import AfterSalesPanel from '../panels/aftersales/AfterSalesPanel'
import ITAdminPanel from '../panels/itadmin/ITAdminPanel'
import MarketingPanel from '../panels/marketing/MarketingPanel'
import FinancePanel from '../panels/finance/FinancePanel'
import ResourcesPanel from '../panels/resources/ResourcesPanel'
import ReferralPanel from '../panels/referral/ReferralPanel'
import ProductsPanel from '../panels/products/ProductsPanel'
import HomePanel from '../panels/home/HomePanel'
import AboutPanel from '../panels/about/AboutPanel'
import TrainingPanel from '../panels/training/TrainingPanel'
import AccessControlPanel from '../panels/accesscontrol/AccessControlPanel'
import ActivityLogPanel from '../panels/activitylog/ActivityLogPanel'
import SmartFleetPanel from '../panels/smartfleet/SmartFleetPanel'
import DashboardsHubPanel from '../panels/dashboardshub/DashboardsHubPanel'
import TaskChecklistPanel from '../panels/taskchecklist/TaskChecklistPanel'
import FMSPanel from '../panels/fms/FMSPanel'

const PANEL_COMPONENTS = {
  home: HomePanel,
  about: AboutPanel,
  training: TrainingPanel,
  adminperms: AccessControlPanel,
  activitylog: ActivityLogPanel,
  leads: SmartFleetPanel,
  dashboardshub: DashboardsHubPanel,
  tasks: TaskChecklistPanel,
  fms: FMSPanel,
  hr: HRPanel,
  sales: SalesPanel,
  aftersales: AfterSalesPanel,
  itadmin: ITAdminPanel,
  marketing: MarketingPanel,
  finance: FinancePanel,
  resources: ResourcesPanel,
  referral: ReferralPanel,
  products: ProductsPanel,
}

const PANEL_LABELS = NAV_ITEMS.reduce((acc, item) => {
  acc[item.id] = item.label
  if (item.children) item.children.forEach((c) => (acc[c.id] = c.label))
  return acc
}, {})

export default function PortalShell() {
  const { theme, toggleTheme } = useTheme()
  const { currentUser } = useAuth()
  const [activePanel, setActivePanel] = useState('home')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [userSheetOpen, setUserSheetOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)

  function navigate(id) {
    trackPageSwitch(currentUser, id)
    setActivePanel(id)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const ActivePanelComponent = PANEL_COMPONENTS[activePanel]

  return (
    <TaskChecklistNavProvider>
      <FileViewerProvider>
        <CelebrationsProvider>
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
                  <ActivePanelComponent onNavigate={navigate} />
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
            <CelebrationWishPopup />
            <MyWishesModal />
          </div>
        </CelebrationsProvider>
      </FileViewerProvider>
    </TaskChecklistNavProvider>
  )
}
