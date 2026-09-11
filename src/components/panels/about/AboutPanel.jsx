import { useState } from 'react'
import {
  CERTIFICATIONS,
  CERT_BADGES,
  CORE_VALUES,
  LOCATIONS,
  MILESTONES,
  MISSION,
  OUR_STORY,
  STATS,
  UPCOMING_OFFICES,
  VISION,
} from './aboutData'

// Ported from old-portal/index.html's #panel-about + app.js's switchAbout() —
// 100% static content, no data source. 4 tabs only (Overview/Locations/
// Milestones/Certifications) — the "Brand Guidelines" section in the
// source has no tab button and is never reached by switchAbout() in
// production, so it's not included here (see MIGRATION-NOTES.md's Dead
// code observed).
const TABS = [
  { id: 'overview', label: '🏢 About Aditi' },
  { id: 'locations', label: '📍 Locations' },
  { id: 'milestones', label: '🏆 Milestones' },
  { id: 'certifications', label: '🏅 Certifications' },
]

export default function AboutPanel() {
  const [activeTab, setActiveTab] = useState('overview')

  return (
    <div className="px-4 sm:px-6 py-5">
      <div className="flex items-center justify-between gap-3 mb-1">
        <div>
          <div className="text-[16px] font-semibold text-text">About Organisation</div>
          <div className="text-[11.5px] text-text-muted mt-0.5">Portal → About Organisation</div>
        </div>
        <a
          href="https://www.adititracking.com/about-us/"
          target="_blank"
          rel="noreferrer"
          className="text-[12px] font-medium text-primary border border-primary/30 rounded-md px-3 py-1.5"
        >
          🌐 Visit Website
        </a>
      </div>

      {/* Company identity banner */}
      <div className="rounded-2xl border border-primary/25 bg-primary-tint p-5 mt-4 mb-5">
        <div className="text-[19px] font-semibold text-text">Aditi Tracking Support Pvt. Ltd.</div>
        <div className="flex items-center gap-2.5 flex-wrap mt-1.5">
          <span className="text-[12.5px] font-semibold text-primary">🏆 India's Leading Telematics Company</span>
          <span className="w-1 h-1 rounded-full bg-text-muted" />
          <span className="text-[11.5px] text-text-muted">Est. 2011 · Mumbai, India</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 flex-wrap mb-5">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            className={`rounded-lg px-3.5 py-2 text-[12.5px] font-medium border transition-colors ${
              activeTab === t.id
                ? 'bg-primary-tint text-primary border-primary/30'
                : 'bg-surface-2 text-text-muted border-border hover:text-text'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && <OverviewTab onNavigateCertifications={() => setActiveTab('certifications')} />}
      {activeTab === 'locations' && <LocationsTab />}
      {activeTab === 'milestones' && <MilestonesTab />}
      {activeTab === 'certifications' && <CertificationsTab />}
    </div>
  )
}

function StatCard({ stat, onClick }) {
  return (
    <div
      onClick={onClick}
      className={`rounded-xl border border-border bg-surface p-5 text-center ${onClick ? 'cursor-pointer hover:border-primary/40' : ''}`}
    >
      <div className="text-[26px] font-bold text-primary">{stat.value}</div>
      <div className="text-[10.5px] text-text-muted mt-1 uppercase tracking-wide">{stat.label}</div>
      {stat.link && <div className="text-[10.5px] font-semibold text-primary mt-1.5">View All →</div>}
    </div>
  )
}

function OverviewTab({ onNavigateCertifications }) {
  return (
    <div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 mb-5">
        {STATS.map((s) => (
          <StatCard key={s.label} stat={s} onClick={s.link ? onNavigateCertifications : undefined} />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4 mb-4">
        <div className="rounded-2xl border border-border bg-surface p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[18px]">🏢</span>
            <span className="text-[13.5px] font-semibold text-text">Our Story</span>
          </div>
          <div className="text-[12.5px] text-text-muted leading-relaxed space-y-3">
            {OUR_STORY.map((p) => (
              <p key={p.slice(0, 24)}>{p}</p>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[18px]">💎</span>
            <span className="text-[13.5px] font-semibold text-text">Core Values</span>
          </div>
          <div className="flex flex-col gap-2.5">
            {CORE_VALUES.map((v) => (
              <div key={v.title} className="flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-md bg-primary-tint text-primary flex items-center justify-center text-[13px] shrink-0">
                  {v.icon}
                </span>
                <div>
                  <div className="text-[12px] font-semibold text-text">{v.title}</div>
                  <div className="text-[11px] text-text-muted">{v.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-border bg-surface p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[18px]">🔭</span>
            <span className="text-[13.5px] font-semibold text-text">Our Vision</span>
          </div>
          <p className="text-[12.5px] text-text-muted leading-relaxed">{VISION}</p>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[18px]">🎯</span>
            <span className="text-[13.5px] font-semibold text-text">Our Mission</span>
          </div>
          <p className="text-[12.5px] text-text-muted leading-relaxed">{MISSION}</p>
        </div>
      </div>
    </div>
  )
}

function LocationsTab() {
  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-5">
        {LOCATIONS.map((loc) => (
          <div key={loc.name} className="rounded-2xl border border-border bg-surface p-5 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: loc.accent }} />
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[18px]">{loc.icon}</span>
              <span className="text-[13px] font-semibold text-text flex-1">{loc.name}</span>
              <span
                className="text-[10px] font-semibold rounded-full px-2 py-0.5"
                style={{ color: loc.accent, background: loc.accent + '1f', border: `1px solid ${loc.accent}40` }}
              >
                {loc.badge}
              </span>
            </div>
            <div className="text-[12px] text-text-muted leading-relaxed mb-3">
              {loc.lines.map((l) => (
                <div key={l}>{l}</div>
              ))}
            </div>
            {loc.phone && (
              <div className="text-[12px] text-primary mb-3">
                📞 <a href={`tel:${loc.phone}`}>{loc.phoneDisplay}</a>
              </div>
            )}
            <a
              href={loc.mapUrl}
              target="_blank"
              rel="noreferrer"
              className="block text-center text-[11.5px] font-medium rounded-md border px-3 py-2"
              style={{ color: loc.accent, borderColor: loc.accent }}
            >
              {loc.mapLabel}
            </a>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-border bg-surface p-5">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[18px]">📡</span>
          <span className="text-[13.5px] font-semibold text-text">Upcoming Office</span>
        </div>
        <div className="flex gap-2.5 flex-wrap">
          {UPCOMING_OFFICES.map((city) => (
            <div key={city} className="rounded-lg bg-surface-2 border border-border px-4 py-2.5 text-[12.5px] font-semibold text-text">
              {city}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function MilestonesTab() {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-[18px]">🏆</span>
        <span className="text-[13.5px] font-semibold text-text">Company Milestones — 15-Years Journey</span>
      </div>
      <div className="flex flex-col gap-4">
        {MILESTONES.map((m) => (
          <div key={m.year} className="flex gap-3.5">
            <div className="w-12 shrink-0 text-[13px] font-bold text-primary">{m.year}</div>
            <div className="w-2 h-2 rounded-full border-2 border-primary mt-1 shrink-0" />
            <div className="pb-1">
              <div className="text-[12.5px] font-semibold text-text">{m.title}</div>
              <div className="text-[11.5px] text-text-muted mt-0.5 leading-relaxed">{m.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function CertCard({ cert }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5" style={{ borderLeft: `4px solid ${cert.accent}` }}>
      <div className="flex items-start gap-3 mb-3">
        <div
          className="w-11 h-11 rounded-lg flex items-center justify-center text-[18px] shrink-0"
          style={{ background: cert.accent + '1a', border: `1px solid ${cert.accent}40` }}
        >
          {cert.icon}
        </div>
        <div>
          <div className="text-[10.5px] uppercase tracking-wide text-text-muted font-semibold mb-0.5">{cert.category}</div>
          <div className="text-[14px] font-bold text-text">{cert.title}</div>
        </div>
      </div>
      <div className="flex flex-col gap-1.5 text-[11.5px]">
        {cert.fields.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-3 border-b border-border pb-1.5 last:border-0 last:pb-0">
            <span className="text-text-muted shrink-0">{label}</span>
            <span className="text-text font-medium text-right">{value}</span>
          </div>
        ))}
      </div>
      <div
        className="mt-2.5 inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[10.5px] font-semibold"
        style={{
          background: cert.statusAccent ? 'var(--color-primary-tint)' : 'rgba(0,212,170,0.1)',
          color: cert.statusAccent ? 'var(--color-primary)' : '#00d4aa',
        }}
      >
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: cert.statusAccent ? 'var(--color-primary)' : '#00d4aa' }} />
        {cert.status}
      </div>
    </div>
  )
}

function CertificationsTab() {
  return (
    <div>
      <div className="rounded-xl border border-primary/20 bg-primary-tint p-4 mb-5 flex items-center gap-3.5">
        <span className="text-[28px]">🏅</span>
        <div>
          <div className="text-[13px] font-semibold text-text mb-0.5">Certifications &amp; Accreditations</div>
          <div className="text-[11.5px] text-text-muted leading-relaxed">
            Aditi Tracking Support Pvt. Ltd. holds multiple prestigious certifications demonstrating our commitment to
            quality, security and industry excellence.
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {CERTIFICATIONS.map((c) => (
          <CertCard key={c.title} cert={c} />
        ))}
      </div>

      <div className="mt-4 rounded-xl border border-border bg-surface p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[12.5px] font-semibold text-text">🏆 Certified Excellence Since 2019</div>
          <div className="text-[11px] text-text-muted mt-0.5">
            All certifications are maintained through regular audits and surveillance reviews.
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {CERT_BADGES.map((b) => (
            <span key={b} className="text-[11px] font-semibold text-primary bg-primary-tint border border-primary/20 rounded-full px-3 py-1">
              {b}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
