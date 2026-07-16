"use client"

import { useState } from "react"
import AIConfigTab from "./AIConfigTab"
import SettingsTab from "./SettingsTab"
import LogsTab from "./LogsTab"

const SECTIONS = [
  { id: "email", label: "Email & Discovery" },
  { id: "ai", label: "AI Keys" },
  { id: "logs", label: "Logs" },
] as const

type SectionId = (typeof SECTIONS)[number]["id"]

/** Setup bundled: SMTP, Places key, schedule, AI keys, logs. */
export default function SetupTab() {
  const [section, setSection] = useState<SectionId>("email")

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1 border-b border-gray-200 pb-2">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSection(s.id)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
              section === s.id ? "bg-indigo-50 text-indigo-800" : "text-gray-600 hover:bg-gray-50"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
      {section === "email" && <SettingsTab />}
      {section === "ai" && <AIConfigTab />}
      {section === "logs" && <LogsTab />}
    </div>
  )
}
