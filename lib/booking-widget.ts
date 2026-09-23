/** Defaults + helpers for public booking link/embed */

export type BookingFormFieldType =
  | "text"
  | "email"
  | "tel"
  | "textarea"
  | "number"
  | "select"
  | "dropdown"
  | "checkbox"
  | "radio"
  | "plan"

export type BookingFormField = {
  id: string
  label: string
  type: BookingFormFieldType
  required: boolean
  enabled: boolean
  placeholder?: string
  /** Select / dropdown / radio choices */
  options?: string[]
  /** Optional icon name (Feather) or image URL per option label */
  optionIcons?: Record<string, string>
  /** Field-level icon (checkbox / section) */
  icon?: string
  /** Optional image for checkbox / plan cards */
  imageUrl?: string
  helpText?: string
}

export type BookingServiceOption = {
  id: string
  label: string
  durationMinutes: number
  /** Optional marketing blurb / price line */
  description?: string
  icon?: string
  imageUrl?: string
}

export type DayHours = { start: string; end: string } | null
export type WeeklyHours = Record<string, DayHours>

export const FIELD_TYPE_OPTIONS: { value: BookingFormFieldType; label: string }[] = [
  { value: "text", label: "Short text" },
  { value: "email", label: "Email" },
  { value: "tel", label: "Phone" },
  { value: "textarea", label: "Long text" },
  { value: "number", label: "Number" },
  { value: "select", label: "Dropdown" },
  { value: "radio", label: "Choice buttons" },
  { value: "checkbox", label: "Yes / No checkbox" },
  { value: "plan", label: "Service cards" },
]

export const DEFAULT_FORM_FIELDS: BookingFormField[] = [
  {
    id: "name",
    label: "Full name",
    type: "text",
    required: true,
    enabled: true,
    placeholder: "Your name",
  },
  {
    id: "email",
    label: "Email",
    type: "email",
    required: true,
    enabled: true,
    placeholder: "you@example.com",
  },
  {
    id: "phone",
    label: "Phone",
    type: "tel",
    required: true,
    enabled: true,
    placeholder: "+1 555 000 0000",
  },
  {
    id: "address",
    label: "Property address",
    type: "textarea",
    required: true,
    enabled: true,
    placeholder: "Street, city, postcode",
  },
  {
    id: "serviceType",
    label: "Service",
    type: "plan",
    required: true,
    enabled: true,
  },
  {
    id: "notes",
    label: "Notes for the team",
    type: "textarea",
    required: false,
    enabled: true,
    placeholder: "Access codes, pets, special requests…",
  },
]

export const DEFAULT_SERVICE_OPTIONS: BookingServiceOption[] = [
  { id: "standard", label: "Standard clean", durationMinutes: 120, icon: "home" },
  { id: "deep", label: "Deep clean", durationMinutes: 180, icon: "sparkles" },
  { id: "eot", label: "End of tenancy", durationMinutes: 240, icon: "key" },
  { id: "airbnb", label: "Airbnb turnover", durationMinutes: 90, icon: "repeat" },
]

/** Mon–Fri 09:00–17:00, weekends closed */
export const DEFAULT_WEEKLY_HOURS: WeeklyHours = {
  "0": null,
  "1": { start: "09:00", end: "17:00" },
  "2": { start: "09:00", end: "17:00" },
  "3": { start: "09:00", end: "17:00" },
  "4": { start: "09:00", end: "17:00" },
  "5": { start: "09:00", end: "17:00" },
  "6": null,
}

export const DEFAULT_THEME = {
  primaryColor: "#0B1F33",
  accentColor: "#D97706",
  backgroundColor: "#F7F4EF",
  textColor: "#0F172A",
}

/** Cadence choices shown on the public form when studio enables recurring */
export const BOOKING_RECURRING_OPTIONS: {
  value: "weekly" | "biweekly" | "monthly"
  label: string
  hint: string
}[] = [
  { value: "weekly", label: "Every week", hint: "Same day each week" },
  { value: "biweekly", label: "Every 2 weeks", hint: "Fortnightly" },
  { value: "monthly", label: "Every month", hint: "~4 weeks" },
]

export function labelForRecurringPattern(pattern?: string | null): string {
  const match = BOOKING_RECURRING_OPTIONS.find((o) => o.value === pattern)
  return match?.label || (pattern ? String(pattern) : "")
}

/** Map booking cadence → RecurringJob create payload pieces */
export function recurringPatternToJobFields(
  pattern: string,
  requestedStart: Date
): {
  recurrenceType: "weekly" | "interval"
  intervalDays?: number
  allowedDaysOfWeek?: number[]
  nextRunAt: Date
} {
  // RecurringJob weekday: 1=Mon … 7=Sun
  const js = requestedStart.getDay()
  const isoDay = js === 0 ? 7 : js
  const addDays = (d: Date, n: number) => {
    const x = new Date(d.getTime())
    x.setDate(x.getDate() + n)
    return x
  }
  if (pattern === "weekly") {
    return {
      recurrenceType: "weekly",
      allowedDaysOfWeek: [isoDay],
      nextRunAt: addDays(requestedStart, 7),
    }
  }
  if (pattern === "monthly") {
    return {
      recurrenceType: "interval",
      intervalDays: 28,
      nextRunAt: addDays(requestedStart, 28),
    }
  }
  // biweekly default
  return {
    recurrenceType: "interval",
    intervalDays: 14,
    nextRunAt: addDays(requestedStart, 14),
  }
}

export function slugifyBooking(input: string): string {
  return (
    String(input || "book")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "book"
  )
}

export function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function newFieldId(prefix = "field") {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`
}

/** Format dynamic booking answers for task notes / mobile display */
export function formatFieldAnswersForTask(
  answers: Record<string, unknown>,
  fields?: BookingFormField[]
): string {
  const lines: string[] = []
  const fieldMap = new Map((fields || []).map((f) => [f.id, f]))
  const skip = new Set([
    "name",
    "email",
    "phone",
    "address",
    "notes",
    "requestedStart",
    "source",
    "recurringRequested",
    "wantsRecurring",
    "recurringPattern",
  ])

  for (const [key, raw] of Object.entries(answers || {})) {
    if (skip.has(key) || raw == null || raw === "") continue
    const field = fieldMap.get(key)
    const label = field?.label || key
    let value = String(raw)
    if (field?.type === "checkbox") {
      value = raw === true || raw === "true" || raw === "yes" || raw === "on" ? "Yes" : "No"
    }
    lines.push(`${label}: ${value}`)
  }

  const wants =
    answers?.recurringRequested === true ||
    answers?.recurringRequested === "true" ||
    answers?.wantsRecurring === true ||
    answers?.wantsRecurring === "true"
  const pattern = String(answers?.recurringPattern || "").trim()
  if (wants && pattern) {
    lines.push(`Recurring: ${labelForRecurringPattern(pattern)}`)
  } else if (wants) {
    lines.push("Recurring: requested")
  }

  return lines.join("\n")
}

export function serializeWidgetPublic(config: {
  publicSlug: string
  headline: string | null
  description: string | null
  successMessage: string | null
  logoUrl: string | null
  primaryColor: string
  accentColor: string
  backgroundColor: string
  textColor: string
  formFields: string
  serviceOptions: string
  showCalendar: boolean
  showRecurringOption?: boolean
  companyName?: string
}) {
  return {
    slug: config.publicSlug,
    companyName: config.companyName || "Cleaning company",
    headline: config.headline || "Book a cleaning",
    description:
      config.description ||
      "Choose a time that works for you — we’ll confirm shortly.",
    successMessage:
      config.successMessage ||
      "Thanks! Your booking request is in. We’ll be in touch soon.",
    logoUrl: config.logoUrl,
    theme: {
      primary: config.primaryColor || DEFAULT_THEME.primaryColor,
      accent: config.accentColor || DEFAULT_THEME.accentColor,
      background: config.backgroundColor || DEFAULT_THEME.backgroundColor,
      text: config.textColor || DEFAULT_THEME.textColor,
    },
    formFields: parseJson(config.formFields, DEFAULT_FORM_FIELDS).filter(
      (f) => f.enabled
    ),
    serviceOptions: parseJson(config.serviceOptions, DEFAULT_SERVICE_OPTIONS),
    showCalendar: config.showCalendar !== false,
    showRecurringOption: config.showRecurringOption === true,
    recurringOptions: BOOKING_RECURRING_OPTIONS,
  }
}

export function tidyflowMarketingUrl() {
  return "https://tidyflowapp.com"
}
