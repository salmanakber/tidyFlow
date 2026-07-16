"use client"

import { useState } from "react"
import CampaignsTab from "./CampaignsTab"
import TemplatesTab from "./TemplatesTab"
import SentEmailsTab from "./SentEmailsTab"
import RepliesTab from "./RepliesTab"

const SECTIONS = [
  { id: "campaigns", label: "Campaigns" },
  { id: "templates", label: "Templates" },
  { id: "sent", label: "Sent" },
  { id: "replies", label: "Replies" },
] as const

type SectionId = (typeof SECTIONS)[number]["id"]

/** Outreach bundled into one tab with a simple sub-menu. */
export default function OutreachTab() {
  const [section, setSection] = useState<SectionId>("campaigns")

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
      {section === "campaigns" && <CampaignsTab />}
      {section === "templates" && <TemplatesTab />}
      {section === "sent" && <SentEmailsTab />}
      {section === "replies" && <RepliesTab />}
    </div>
  )
}
