"use client"

import { useState } from "react"
import AdminLayout from "@/components/AdminLayout"
import { LayoutDashboard, Search, Send, Settings } from "lucide-react"
import DashboardTab from "@/components/sales-agent/DashboardTab"
import LeadDiscoveryTab from "@/components/sales-agent/LeadDiscoveryTab"
import OutreachTab from "@/components/sales-agent/OutreachTab"
import SetupTab from "@/components/sales-agent/SetupTab"

type TabId = "overview" | "leads" | "outreach" | "setup"

const TABS: { id: TabId; label: string; icon: any; blurb: string }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard, blurb: "Stats" },
  { id: "leads", label: "Find Leads", icon: Search, blurb: "Discover" },
  { id: "outreach", label: "Outreach", icon: Send, blurb: "Emails" },
  { id: "setup", label: "Setup", icon: Settings, blurb: "Keys" },
]

export default function AISalesAgentPage() {
  const [activeTab, setActiveTab] = useState<TabId>("leads")

  return (
    <AdminLayout>
      <div className="p-4 md:p-6 max-w-[1200px] mx-auto">
        <div className="mb-5">
          <p className="text-xs text-gray-500 mb-1">Marketing / AI Sales Agent</p>
          <h1 className="text-2xl font-semibold text-gray-900">AI Sales Agent</h1>
          <p className="mt-1 text-sm text-gray-500">
            Find cleaning companies across countries, score them with AI, then email.
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-6">
          {TABS.map((tab) => {
            const Icon = tab.icon
            const active = activeTab === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
                  active
                    ? "border-slate-900 bg-slate-900 text-white shadow-sm"
                    : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
                }`}
              >
                <Icon className="w-5 h-5 shrink-0" />
                <div>
                  <div className="text-sm font-semibold">{tab.label}</div>
                  <div className={`text-xs ${active ? "text-slate-300" : "text-gray-400"}`}>{tab.blurb}</div>
                </div>
              </button>
            )
          })}
        </div>

        {activeTab === "overview" && <DashboardTab />}
        {activeTab === "leads" && <LeadDiscoveryTab />}
        {activeTab === "outreach" && <OutreachTab />}
        {activeTab === "setup" && <SetupTab />}
      </div>
    </AdminLayout>
  )
}
