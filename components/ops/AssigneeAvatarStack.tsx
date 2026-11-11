"use client"

/** Overlapping assignee photo bubbles for chat headers / inbox rows. */

export type AssigneeBubble = {
  id: number
  name: string
  profileImage?: string | null
  role?: string
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return "?"
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || "")
    .join("")
}

export default function AssigneeAvatarStack({
  assignees,
  max = 3,
  size = "md",
}: {
  assignees: AssigneeBubble[]
  max?: number
  size?: "sm" | "md" | "lg"
}) {
  const shown = assignees.slice(0, max)
  const extra = Math.max(0, assignees.length - max)
  const dim = size === "lg" ? 36 : size === "sm" ? 24 : 30
  const text = size === "lg" ? "text-[11px]" : size === "sm" ? "text-[8px]" : "text-[9px]"

  if (!assignees.length) {
    return (
      <div
        className="flex items-center justify-center rounded-full border-2 border-dashed border-slate-300 bg-slate-100 font-bold text-slate-400 dark:border-navy-700 dark:bg-navy-900"
        style={{ width: dim, height: dim }}
        title="No one assigned"
      >
        <span className={text}>—</span>
      </div>
    )
  }

  return (
    <div className="flex items-center" title={assignees.map((a) => a.name).join(", ")}>
      {shown.map((a, i) => (
        <div
          key={a.id}
          className="relative overflow-hidden rounded-full border-2 border-white bg-navy-900 shadow-sm dark:border-navy-950"
          style={{
            width: dim,
            height: dim,
            marginLeft: i === 0 ? 0 : -Math.round(dim * 0.35),
            zIndex: shown.length - i,
          }}
        >
          {a.profileImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={a.profileImage} alt={a.name} className="h-full w-full object-cover" />
          ) : (
            <div
              className={`flex h-full w-full items-center justify-center font-bold text-amber-300 ${text}`}
            >
              {initials(a.name)}
            </div>
          )}
        </div>
      ))}
      {extra > 0 && (
        <div
          className="relative flex items-center justify-center rounded-full border-2 border-white bg-slate-200 font-bold text-slate-600 dark:border-navy-950 dark:bg-navy-800 dark:text-slate-300"
          style={{
            width: dim,
            height: dim,
            marginLeft: -Math.round(dim * 0.35),
            zIndex: 0,
          }}
        >
          <span className={text}>+{extra}</span>
        </div>
      )}
    </div>
  )
}
