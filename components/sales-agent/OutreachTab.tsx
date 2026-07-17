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
      <div className="flex flex-wrap gap-1 border-b border-[#E3E7F0] pb-0">
        {SECTIONS.map((s) => {
          const active = section === s.id
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setSection(s.id)}
              className={`relative px-3 py-2 text-sm font-medium transition-colors ${
                active ? "text-[#0B1B3B]" : "text-[#8890A0] hover:text-[#5B6478]"
              }`}
            >
              {s.label}
              {active && (
                <span className="absolute left-0 right-0 -bottom-[1px] h-[2px] rounded-full bg-[#D98E04]" />
              )}
            </button>
          )
        })}
      </div>
      {section === "campaigns" && <CampaignsTab />}
      {section === "templates" && <TemplatesTab />}
      {section === "sent" && <SentEmailsTab />}
      {section === "replies" && <RepliesTab />}
    </div>
  )
}