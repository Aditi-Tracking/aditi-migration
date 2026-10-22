import { useState } from 'react'
import Icon from '../../shared/Icon'
import OverlayShell from '../../shared/OverlayShell'
import TabButton from '../../shared/TabButton'
import MecaLinkTab from './MecaLinkTab'
import MecaTargetsTab from './MecaTargetsTab'

// Setup (admin: sales_meca_manage + view_all): the two things MeCa cannot work out for itself.
//   Link sales people   which employee each Sales Person name on a lead stands for
//   Targets             each rep's monthly turnover target
// Both tabs stay mounted once opened (hidden when the other shows), so a half-typed target grid survives a look at the links.
// Props: notify(toast) — the panel's one toast host, onChanged() — the report behind must refetch, onClose
export default function MecaSetupModal({ notify, onChanged, onClose }) {
  const [tab, setTab] = useState('link')
  const [visited, setVisited] = useState(() => new Set(['link']))
  const [dirty, setDirty] = useState(false) // unsaved targets

  const guard = (go) => {
    if (dirty && !confirm('Discard your unsaved targets?')) return
    setDirty(false)
    go()
  }
  const open = (id) => {
    if (id === tab) return
    // a half-typed target grid survives a look at the links, so switching tabs needs no guard; only leaving the modal does
    setTab(id)
    setVisited((v) => new Set(v).add(id))
  }

  return (
    <OverlayShell open onClose={() => guard(onClose)} maxWidth="max-w-6xl" closeIcon={<Icon name="x" size={16} />}>
      <div className="text-[17px] font-extrabold text-text mb-3 pr-10">Set up Sales Rep MeCa</div>
      <div className="flex gap-2 mb-4">
        <TabButton active={tab === 'link'} onClick={() => open('link')}>
          Link sales people
        </TabButton>
        <TabButton active={tab === 'targets'} onClick={() => open('targets')}>
          Targets{dirty ? ' •' : ''}
        </TabButton>
      </div>
      <div hidden={tab !== 'link'}>
        <MecaLinkTab notify={notify} onChanged={onChanged} />
      </div>
      {visited.has('targets') && (
        <div hidden={tab !== 'targets'}>
          <MecaTargetsTab notify={notify} onChanged={onChanged} dirty={dirty} onDirty={setDirty} />
        </div>
      )}
    </OverlayShell>
  )
}
