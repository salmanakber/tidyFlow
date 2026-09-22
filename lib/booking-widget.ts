/** Defaults + helpers for public booking link/embed */

export type BookingFormFieldType = "text" | "email" | "tel" | "textarea" | "number" | "select"

export type BookingFormField = {
  id: string
  label: string
  type: BookingFormFieldType
  required: boolean
  enabled: boolean
  placeholder?: string
  options?: string[]
}

export type BookingServiceOption = {
  id: string
  label: string
  durationMinutes: number
}

export type DayHours = { start: string; end: string } | null
export type WeeklyHours = Record<string, DayHours>

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
    type: "select",
    required: true,
    enabled: true,
    options: ["Standard clean", "Deep clean", "End of tenancy", "Airbnb turnover"],
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
  { id: "standard", label: "Standard clean", durationMinutes: 120 },
  { id: "deep", label: "Deep clean", durationMinutes: 180 },
  { id: "eot", label: "End of tenancy", durationMinutes: 240 },
  { id: "airbnb", label: "Airbnb turnover", durationMinutes: 90 },
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
  }
}

export function tidyflowMarketingUrl() {
  return "https://tidyflowapp.com"
}
