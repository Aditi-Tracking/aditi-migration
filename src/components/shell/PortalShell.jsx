import { useState } from 'react'
import { useTheme } from '../../hooks/useTheme'
import { useAuth } from '../../context/AuthContext'
import { FileViewerProvider } from '../../context/FileViewerContext'
import { CelebrationsProvider } from '../../context/CelebrationsContext'
import { TaskChecklistNavProvider } from '../../context/TaskChecklistNavContext'
import { RenewalsNavProvider } from '../../context/RenewalsNavContext'
import { TaskDelegationNavProvider } from '../../context/TaskDelegationNavContext'
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
import RenewalsPanel from '../panels/renewals/RenewalsPanel'
import TaskDelegationPanel from '../panels/taskdelegation/TaskDelegationPanel'
import CRMVehiclePanel from '../panels/crmvehicle/CRMVehiclePanel'
import FieldServicePanel from '../panels/fieldservice/FieldServicePanel'
import HREmployeeMasterPanel from '../panels/hremployee/HREmployeeMasterPanel'
import VendorRequestsPanel from '../panels/vendorrequests/VendorRequestsPanel'
import RecurringBillsPanel from '../panels/vendorrequests/RecurringBillsPanel'
import DealPricingPanel from '../panels/dealpricing/DealPricingPanel'
import MappingPanel from '../panels/mapping/MappingPanel'
import EnterpriseLeadPanel from '../panels/enterprise/EnterpriseLeadPanel'
import IMSPanel from '../panels/ims/IMSPanel'
import EnterpriseSolutionsPanel from '../panels/enterprisesolutions/EnterpriseSolutionsPanel'

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
  renewals: RenewalsPanel,
  taskdelegation: TaskDelegationPanel,
  crm: CRMVehiclePanel,
  fieldservice: FieldServicePanel,
  hremployee: HREmployeeMasterPanel,
  vendorrequests: VendorRequestsPanel,
  recurringbills: RecurringBillsPanel,
  dealpricing: DealPricingPanel,
  mapping: MappingPanel,
  enterprise: EnterpriseLeadPanel,
  ims: IMSPanel,
  entsol: EnterpriseSolutionsPanel,
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

const PANEL_LABELS = NAV_ITEMS.reduce(
  (acc, item) => {
    acc[item.id] = item.label
    if (item.children) item.children.forEach((c) => (acc[c.id] = c.label))
    return acc
  },
  // Seeded with labels for panels that have no sidebar nav item of their own
  // (see CARD_LAUNCHED_PANELS below) — needed so a "← Back to X" button can
  // still show a real label when X is one of these, e.g. Recurring Bills'
  // back target is Vendor Requests, not a NAV_ITEMS entry.
  { vendorrequests: 'Vendor Requests', recurringbills: 'Recurring Bills', dealpricing: 'Deal Calculator' }
)

// Panels reached only via a card/button click, never a sidebar nav item.
// While one of these is active: the sidebar hides (reclaiming its width,
// which especially helps wide tables) and a "← Back to <launcher>" button
// takes its place, going back to whichever panel actually launched it —
// tracked per-panel in launchSource below, not a hardcoded parent, so
// Recurring Bills (launched from inside Vendor Requests, not directly from
// Finance) correctly returns to Vendor Requests rather than skipping past it.
const CARD_LAUNCHED_PANELS = new Set(['vendorrequests', 'recurringbills', 'dealpricing'])

// max-w-7xl reclaims the dead side margin every panel used to get from a
// narrower max-w-5xl default on wide viewports (validated on Home first,
// then rolled out everywhere). PANEL_MAX_WIDTH stays as a lookup so a
// specific panel can still get a narrower/wider exception later without
// restructuring this — the card-launched panels are the first such
// exception: with no sidebar competing for width, their dense KPI
// grids/tables get a noticeably wider cap instead, derived from
// CARD_LAUNCHED_PANELS so the two sets can't drift apart.
const DEFAULT_MAX_WIDTH = 'max-w-7xl'
const WIDE_MAX_WIDTH = 'max-w-[1600px]'
const PANEL_MAX_WIDTH = Object.fromEntries([...CARD_LAUNCHED_PANELS].map((id) => [id, WIDE_MAX_WIDTH]))

export default function PortalShell() {
  const { theme, toggleTheme } = useTheme()
  const { currentUser } = useAuth()
  const [activePanel, setActivePanel] = useState('home')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [userSheetOpen, setUserSheetOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  // { [cardLaunchedPanelId]: idOfPanelActiveWhenItWasLaunched } — only ever
  // written by navigate() below, never by navigateBack(), so returning from
  // a card-launched panel never overwrites its own recorded launch source.
  const [launchSource, setLaunchSource] = useState({})

  function navigate(id) {
    if (CARD_LAUNCHED_PANELS.has(id)) {
      setLaunchSource((prev) => ({ ...prev, [id]: activePanel }))
    }
    trackPageSwitch(currentUser, id)
    setActivePanel(id)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function navigateBack() {
    const parent = launchSource[activePanel] || 'home'
    trackPageSwitch(currentUser, parent)
    setActivePanel(parent)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const ActivePanelComponent = PANEL_COMPONENTS[activePanel]
  const showSidebar = !CARD_LAUNCHED_PANELS.has(activePanel)
  const backTarget = CARD_LAUNCHED_PANELS.has(activePanel) ? launchSource[activePanel] || 'home' : null

  return (
    <TaskChecklistNavProvider>
    <RenewalsNavProvider>
    <TaskDelegationNavProvider>
      <FileViewerProvider>
        <CelebrationsProvider>
          <div className="min-h-screen flex bg-surface-2">
            {showSidebar && (
              <Sidebar
                activePanel={activePanel}
                onNavigate={navigate}
                theme={theme}
                onToggleTheme={toggleTheme}
                onOpenProfile={() => setProfileOpen(true)}
              />
            )}

            <MobileHeader theme={theme} onToggleTheme={toggleTheme} />

            <main className="flex-1 min-w-0 pt-[52px] md:pt-0 pb-16 md:pb-0">
              <div className={`${PANEL_MAX_WIDTH[activePanel] || DEFAULT_MAX_WIDTH} mx-auto`}>
                {backTarget && (
                  <div className="px-4 sm:px-6 pt-4">
                    <button
                      type="button"
                      onClick={navigateBack}
                      className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-text-muted hover:text-text transition-colors"
                    >
                      ← Back to {PANEL_LABELS[backTarget] || backTarget}
                    </button>
                  </div>
                )}
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
    </TaskDelegationNavProvider>
    </RenewalsNavProvider>
    </TaskChecklistNavProvider>
  )
}
