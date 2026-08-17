
"use client"

import { useState } from "react"
import AIConfigTab from "./AIConfigTab"
import SettingsTab from "./SettingsTab"
import LogsTab from "./LogsTab"
import { Settings, Cpu, Terminal } from "lucide-react"

const SECTIONS = [
  { id: "email", label: "Email & Discovery", icon: Settings },
  { id: "ai", label: "AI Keys", icon: Cpu },
  { id: "logs", label: "System Logs", icon: Terminal },
] as const

type SectionId = (typeof SECTIONS)[number]["id"]

/** Setup bundled: SMTP, Places key, schedule, AI keys, logs. */
export default function SetupTab() {
  const [section, setSection] = useState<SectionId>("email")

  return (
    <div className="space-y-6">
      
      {/* Settings Navigation Bar */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between px-5 py-4 bg-[#F8F9FC] border-b border-gray-100 gap-2">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#0D1E36]">Configuration Panel</h3>
            <p className="text-[11px] text-gray-400">Configure mail routes, AI enrichment parameters, and monitor operational telemetry</p>
          </div>
        </div>

        <div className="px-4 py-1 bg-white">
          <div className="flex flex-wrap gap-1">
            {SECTIONS.map((s) => {
              const Icon = s.icon
              const isActive = section === s.id
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSection(s.id)}
                  className={`relative flex items-center gap-2 px-4 py-3.5 text-xs font-semibold tracking-wide transition-all duration-150 outline-none select-none border-b-2 ${
                    isActive 
                      ? "border-b-[#D97706] text-[#0D1E36] font-bold" 
                      : "border-b-transparent text-slate-500 hover:text-[#0D1E36] hover:bg-slate-50/50"
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? "text-[#D97706]" : "text-slate-400"}`} />
                  {s.label}
                  {isActive && (
                    <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#D97706]" />
                  )}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Dynamic Content Viewport */}
      <div className="transition-all duration-200">
        {section === "email" && <SettingsTab />}
        {section === "ai" && <AIConfigTab />}
        {section === "logs" && <LogsTab />}
      </div>
    </div>
  )
}
