"use client"

import { useState } from "react"
import AdminLayout from "@/components/AdminLayout"
import { LayoutDashboard, Search, Send, Settings } from "lucide-react"
import DashboardTab from "@/components/sales-agent/DashboardTab"
import LeadDiscoveryTab from "@/components/sales-agent/LeadDiscoveryTab"
import OutreachTab from "@/components/sales-agent/OutreachTab"
import SetupTab from "@/components/sales-agent/SetupTab"

type TabId = "overview" | "leads" | "outreach" | "setup"

const TABS: { id: TabId; label: string; icon: any; blurb: string; step: string }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard, blurb: "Stats", step: "01" },
  { id: "leads", label: "Find Leads", icon: Search, blurb: "Discover", step: "02" },
  { id: "outreach", label: "Outreach", icon: Send, blurb: "Emails", step: "03" },
  { id: "setup", label: "Setup", icon: Settings, blurb: "Keys", step: "04" },
]

export default function AISalesAgentPage() {
  const [activeTab, setActiveTab] = useState<TabId>("leads")

  return (
    <AdminLayout>
      <div className="min-h-full bg-[#F6F7FB]">
        <div className="p-4 md:p-6 max-w-[1200px] mx-auto">
          {/* Header */}
          <div className="mb-6">
            <p className="text-[11px] font-semibold tracking-[0.14em] uppercase text-[#D98E04] mb-1.5">
              Marketing · AI Sales Agent
            </p>
            <h1 className="text-2xl md:text-[28px] font-semibold text-[#0B1B3B] tracking-tight">
              AI Sales Agent
            </h1>
            <p className="mt-1.5 text-sm text-[#5B6478] max-w-xl">
              Find cleaning companies across countries, score them with AI, then email.
            </p>
          </div>

          {/* Send-sequence tab rail */}
          <div className="relative mb-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-0 md:rounded-2xl md:border md:border-[#E3E7F0] md:bg-white md:p-1.5 md:shadow-[0_1px_2px_rgba(11,27,59,0.04)]">
              {TABS.map((tab, i) => {
                const Icon = tab.icon
                const active = activeTab === tab.id
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    aria-current={active ? "step" : undefined}
                    className={`group relative flex items-center gap-3 rounded-xl px-4 py-3 text-left transition-all duration-200 border md:border-0 ${
                      active
                        ? "bg-[#0B1B3B] text-white border-[#0B1B3B] shadow-[0_4px_14px_rgba(11,27,59,0.25)]"
                        : "bg-white md:bg-transparent text-[#0B1B3B] border-[#E3E7F0] hover:bg-[#F6F7FB]"
                    }`}
                  >
                    <span
                      className={`text-[10px] font-mono tabular-nums leading-none tracking-wider ${
                        active ? "text-[#D98E04]" : "text-[#A6ADBD] group-hover:text-[#5B6478]"
                      }`}
                    >
                      {tab.step}
                    </span>
                    <Icon className={`w-4 h-4 shrink-0 ${active ? "text-white" : "text-[#5B6478]"}`} />
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate">{tab.label}</div>
                      <div className={`text-[11px] ${active ? "text-white/60" : "text-[#A6ADBD]"}`}>
                        {tab.blurb}
                      </div>
                    </div>

                    {/* transmitting signal bar */}
                    {active && (
                      <span className="absolute left-4 right-4 -bottom-[1px] h-[2px] rounded-full bg-[#D98E04] md:-bottom-1.5" />
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {activeTab === "overview" && <DashboardTab />}
          {activeTab === "leads" && <LeadDiscoveryTab />}
          {activeTab === "outreach" && <OutreachTab />}
          {activeTab === "setup" && <SetupTab />}
        </div>
      </div>
    </AdminLayout>
  )
}