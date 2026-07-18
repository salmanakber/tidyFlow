
"use client"

import { useEffect, useState } from "react"
import {
  saGet,
  saPut,
  saPost,
  saDelete,
  LoadingBlock,
  MessageBanner,
  EmptyState,
  btnSecondary,
  inputCls,
  ProgressBar,
} from "./shared"
import { 
  Plus, 
  Play, 
  CheckCircle2, 
  XCircle, 
  Mail, 
  Inbox, 
  HelpCircle, 
  Settings, 
  Database, 
  Clock, 
  FileText, 
  Info,
  Check,
  Trash2,
  RefreshCw
} from "lucide-react"

function ResultCard({ result }: { result: any }) {
  if (!result) return null
  const ok = !!result.ok
  return (
    <div
      className={`rounded-xl border px-4 py-3 text-xs transition-all duration-150 ${
        ok 
          ? "bg-green-50/50 border-green-200 text-green-900" 
          : "bg-rose-50/50 border-rose-200 text-rose-900"
      }`}
    >
      <div className="flex items-start gap-3">
        {ok ? (
          <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-green-600" />
        ) : (
          <XCircle className="w-4 h-4 mt-0.5 shrink-0 text-rose-600" />
        )}
        <div className="min-w-0 space-y-1 flex-1">
          <p className="font-bold tracking-wide uppercase text-[10px] opacity-90">
            {ok ? "System Verified" : "Diagnostic Failure"}
            {result.provider ? ` · ${String(result.provider)}` : ""}
            {result.step && !result.provider ? ` · ${String(result.step).replace(/_/g, " ")}` : ""}
          </p>
          <p className="font-medium text-xs leading-relaxed">{result.message || result.error || (ok ? "OK" : "Failed")}</p>
          
          {result.warning && (
            <p className="text-xs rounded-lg bg-amber-50 border border-[#FEF3C7] text-amber-900 px-2.5 py-1.5 mt-1">
              {result.warning}
            </p>
          )}
          {result.fromEmail && (
            <p className="text-[10px] text-gray-500 font-mono">
              <strong>From:</strong> {result.fromEmail}
              {result.replyToEmail ? (
                <> · <strong>Reply-To:</strong> {result.replyToEmail}</>
              ) : null}
              {result.provider ? (
                <> · <strong>Provider:</strong> {result.provider}</>
              ) : null}
            </p>
          )}
          {result.smtpResponse && (
            <p className="text-[10px] font-mono break-all opacity-85 bg-white/60 p-1.5 rounded border border-gray-100">
              SMTP: {String(result.smtpResponse)}
            </p>
          )}
          {result.messageId && (
            <p className="text-[10px] font-mono break-all opacity-85">Message-ID: {result.messageId}</p>
          )}
          {result.hint && <p className="text-[11px] text-gray-500 italic mt-1">Hint: {result.hint}</p>}
          {result.tip && <p className="text-[11px] text-[#D97706] italic mt-1">Tip: {result.tip}</p>}
          {Array.isArray(result.nextSteps) && (
            <ol className="text-[11px] list-decimal ml-4 space-y-1 text-slate-700 pt-1">
              {result.nextSteps.map((s: string, i: number) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          )}
          {result.imap?.unseen != null && (
            <p className="text-[11px] font-mono text-slate-600">
              Inbox: {result.imap.messages} messages · {result.imap.unseen} unread
            </p>
          )}
          {result.imported != null && (
            <p className="text-[11px] font-mono text-slate-600">
              Checked {result.checked} · imported {result.imported} · skipped {result.skipped}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

/** Secret field: when already saved, show badge + disabled input until user clicks Change. */
function SavedSecretField({
  label,
  hasSaved,
  editing,
  onEdit,
  onCancel,
  value,
  onChange,
  placeholder = "Enter new value",
}: {
  label: string
  hasSaved: boolean
  editing: boolean
  onEdit: () => void
  onCancel: () => void
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  const locked = hasSaved && !editing
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <label className="block text-[10px] font-bold text-[#0D1E36] uppercase tracking-wider">{label}</label>
        {hasSaved && (
          <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-green-800 bg-green-50 border border-green-200 px-1.5 py-0.5 rounded-full">
            <Check className="w-2.5 h-2.5" /> Already saved
          </span>
        )}
      </div>
      {locked ? (
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="password"
            disabled
            readOnly
            className={`${inputCls} opacity-60 cursor-not-allowed bg-slate-50`}
            value="••••••••••••••••"
          />
          <button
            type="button"
            className={`${btnSecondary} text-xs py-2 shrink-0 whitespace-nowrap`}
            onClick={onEdit}
          >
            Change
          </button>
        </div>
      ) : (
        <div className="space-y-1.5">
          {hasSaved && (
            <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
              Password already saved — enter a new value to replace it, then save this card.
            </p>
          )}
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="password"
              className={`${inputCls} focus:border-[#D97706]`}
              placeholder={placeholder}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              autoComplete="new-password"
            />
            {hasSaved && (
              <button
                type="button"
                className={`${btnSecondary} text-xs py-2 shrink-0`}
                onClick={onCancel}
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function CardSaveButton({
  saving,
  section,
  onClick,
  label = "Save this card",
}: {
  saving: string | null
  section: string
  onClick: () => void
  label?: string
}) {
  const busy = saving === section
  return (
    <div className="pt-3 border-t border-gray-100 flex justify-end">
      <button
        type="button"
        className="inline-flex items-center px-4 py-2 justify-center bg-[#0D1E36] hover:bg-[#142944] text-white text-xs font-semibold rounded-lg shadow-sm transition-all duration-150 disabled:opacity-50"
        disabled={!!saving}
        onClick={onClick}
      >
        {busy ? "Saving…" : label}
      </button>
    </div>
  )
}

export default function SettingsTab() {
  const [data, setData] = useState<any>(null)
  const [form, setForm] = useState<any>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [jobs, setJobs] = useState<any[]>([])
  const [testTo, setTestTo] = useState("tidyflaw@gmail.com")
  const [testing, setTesting] = useState<string | null>(null)
  const [testSmtp, setTestSmtp] = useState<any>(null)
  const [testResendSmtp, setTestResendSmtp] = useState<any>(null)
  const [testImap, setTestImap] = useState<any>(null)
  const [testSend, setTestSend] = useState<any>(null)
  const [testResendSend, setTestResendSend] = useState<any>(null)
  const [testSync, setTestSync] = useState<any>(null)
  const [editSecrets, setEditSecrets] = useState<Record<string, boolean>>({})
  const [jobForm, setJobForm] = useState({
    name: "",
    jobType: "lead_discovery",
    cronExpression: "0 9 * * *",
    runAt: "",
    keyword: "Cleaning Company",
    countries: "",
    cities: "",
  })

  const load = async () => {
    setLoading(true)
    try {
      const [settings, scheduler] = await Promise.all([saGet("/settings"), saGet("/scheduler")])
      setData(settings)
      setJobs(scheduler)
      setForm({
        smtpHost: settings.smtp.host,
        smtpPort: settings.smtp.port,
        smtpUsername: settings.smtp.username,
        smtpPassword: "",
        senderEmail: settings.smtp.senderEmail,
        senderName: settings.smtp.senderName,
        replyToEmail: settings.smtp.replyToEmail || "tidyflaw@gmail.com",
        resendEnabled: settings.resend?.enabled !== false,
        resendHost: settings.resend?.host || "smtp.resend.com",
        resendPort: settings.resend?.port || 587,
        resendUsername: settings.resend?.username || "resend",
        resendApiKey: "",
        resendSenderEmail: settings.resend?.senderEmail || settings.smtp.senderEmail || "",
        resendSenderName: settings.resend?.senderName || settings.smtp.senderName || "TidyFlow",
        replyImapEnabled: settings.replyInbox?.enabled || false,
        replyImapHost: settings.replyInbox?.host || "imap.gmail.com",
        replyImapPort: settings.replyInbox?.port || 993,
        replyImapUser: settings.replyInbox?.user || settings.smtp.replyToEmail || "tidyflaw@gmail.com",
        replyImapPassword: "",
        replyImapTls: true,
        dailyEmailLimit: settings.smtp.dailyLimit,
        hourlyEmailLimit: settings.smtp.hourlyLimit,
        googlePlacesApiKey: "",
        searchEngine: settings.discovery.searchEngine,
        searchDelayMs: settings.discovery.searchDelayMs,
        maxResults: settings.discovery.maxResults,
        concurrentWorkers: settings.discovery.concurrentWorkers,
        bookingLink: settings.discovery.bookingLink,
        defaultContactName: settings.templateDefaults?.defaultContactName || "",
        defaultPersonalizedIntro: settings.templateDefaults?.defaultPersonalizedIntro || "",
        defaultServices: settings.templateDefaults?.defaultServices || "",
        defaultCity: settings.templateDefaults?.defaultCity || "",
        defaultCompanyName: settings.templateDefaults?.defaultCompanyName || "",
      })
      if (settings.smtp.replyToEmail) setTestTo(settings.smtp.replyToEmail)
      setEditSecrets({})
    } catch (e: any) {
      setMessage({ type: "error", text: e.message })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const SECRET_KEYS = ["smtpPassword", "resendApiKey", "replyImapPassword", "googlePlacesApiKey"] as const

  const saveSection = async (section: string, keys: string[], successLabel: string) => {
    setSaving(section)
    setMessage(null)
    try {
      const payload: Record<string, any> = {}
      for (const key of keys) {
        if (form[key] !== undefined && form[key] !== null) {
          payload[key] = form[key]
        }
      }

      const secretAlreadySaved: Record<string, boolean> = {
        smtpPassword: !!data?.smtp?.hasPassword,
        resendApiKey: !!data?.resend?.hasApiKey,
        replyImapPassword: !!data?.replyInbox?.hasPassword,
        googlePlacesApiKey: !!data?.discovery?.hasGooglePlacesKey,
      }

      for (const key of SECRET_KEYS) {
        if (!(key in payload)) continue
        const val = String(payload[key] || "")
        if (!val || val.startsWith("••")) {
          delete payload[key]
          continue
        }
        // Already saved secrets only update when user clicked Change
        if (secretAlreadySaved[key] && !editSecrets[key]) {
          delete payload[key]
        }
      }

      if ("replyImapEnabled" in payload) payload.replyImapEnabled = !!payload.replyImapEnabled
      if ("resendEnabled" in payload) payload.resendEnabled = payload.resendEnabled ? "true" : "false"
      if ("replyImapTls" in payload) payload.replyImapTls = true
      await saPut("/settings", payload)
      setMessage({ type: "success", text: successLabel })
      await load()
    } catch (e: any) {
      setMessage({ type: "error", text: e.message })
    } finally {
      setSaving(null)
    }
  }

  const startEditSecret = (key: string) => {
    setEditSecrets((prev) => ({ ...prev, [key]: true }))
    setForm((prev: any) => ({ ...prev, [key]: "" }))
  }

  const cancelEditSecret = (key: string) => {
    setEditSecrets((prev) => ({ ...prev, [key]: false }))
    setForm((prev: any) => ({ ...prev, [key]: "" }))
  }

  const runTest = async (action: string) => {
    setTesting(action)
    setMessage(null)
    const timeouts: Record<string, number> = {
      test_smtp: 20000,
      test_resend_smtp: 20000,
      test_imap: 25000,
      test_send: 45000,
      test_resend_send: 45000,
      test_reply_sync: 60000,
      test_all: 90000,
    }
    try {
      const result = await saPost(
        "/settings",
        { action, toEmail: testTo },
        { timeout: timeouts[action] ?? 30000 }
      )
      if (action === "test_smtp") setTestSmtp(result)
      if (action === "test_resend_smtp") setTestResendSmtp(result)
      if (action === "test_imap") setTestImap(result)
      if (action === "test_send") setTestSend(result)
      if (action === "test_resend_send") setTestResendSend(result)
      if (action === "test_reply_sync") setTestSync(result)
      if (action === "test_all") {
        setTestSmtp(result.smtp)
        setTestResendSmtp(result.resendSmtp)
        setTestImap(result.imap)
        if (result.send) setTestSend(result.send)
      }
      const failed =
        result.ok === false ||
        (action === "test_all"
          ? result.smtp?.ok === false || result.imap?.ok === false
          : false)
      setMessage({
        type: failed ? "error" : "success",
        text:
          result.message ||
          result.error ||
          (action === "test_all"
            ? `Diagnostics: Brevo ${result.smtp?.ok ? "OK" : "FAIL"} · Resend ${result.resendSmtp?.ok ? "OK" : "FAIL"} · IMAP ${result.imap?.ok ? "OK" : "FAIL"}`
            : "Verification finished"),
      })
    } catch (e: any) {
      const timedOut =
        e?.code === "ECONNABORTED" ||
        /timeout/i.test(e?.message || "") ||
        e?.message === "Network Error"
      const errText = timedOut
        ? "Verification timed out — SMTP/IMAP servers did not respond. Verify port rules, host credentials, and that outbound traffic is not restricted."
        : e?.response?.data?.message || e.message || "Test execution error"
      if (action === "test_smtp") setTestSmtp({ ok: false, error: errText })
      if (action === "test_resend_smtp") setTestResendSmtp({ ok: false, error: errText })
      if (action === "test_imap") setTestImap({ ok: false, error: errText })
      if (action === "test_send") setTestSend({ ok: false, error: errText })
      if (action === "test_resend_send") setTestResendSend({ ok: false, error: errText })
      if (action === "test_reply_sync") setTestSync({ ok: false, error: errText })
      setMessage({ type: "error", text: errText })
    } finally {
      setTesting(null)
    }
  }

  const fillGmailDefaults = () => {
    setForm((prev: any) => ({
      ...prev,
      replyToEmail: "tidyflaw@gmail.com",
      replyImapEnabled: true,
      replyImapHost: "imap.gmail.com",
      replyImapPort: "993",
      replyImapUser: "tidyflaw@gmail.com",
      replyImapTls: true,
    }))
    setTestTo("tidyflaw@gmail.com")
    setMessage({
      type: "success",
      text: "Gmail server parameters filled for tidyflaw@gmail.com — paste your secure App Password, then save.",
    })
  }

  if (loading) return <LoadingBlock />

  return (
    <div className="space-y-6">
      <MessageBanner message={message} />

      {/* Onboarding Box */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="bg-[#0D1E36] text-white px-5 py-4 flex items-center justify-between border-b border-[#1A314F]">
          <div className="flex items-center gap-2">
            <HelpCircle className="w-5 h-5 text-[#D97706]" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">Gmail Integration & Reply Loop Setup</h3>
          </div>
          <span className="text-[10px] font-bold text-slate-300 font-mono">Documentation</span>
        </div>
        
        <div className="p-5 space-y-4">
          <p className="text-xs text-slate-600 leading-relaxed">
            Configure <strong className="text-[#0D1E36]">tidyflaw@gmail.com</strong> as your central tracking loop.
            Brevo is the primary delivery engine; <strong className="text-[#0D1E36]">Resend</strong> is the automatic
            fallback when Brevo hits limits or errors. Recipient replies still route to Gmail via Reply-To.
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {[
              { step: "1", title: "Access Security", text: "Open Google Account Security under your tidyflaw account." },
              { step: "2", title: "Secure Account", text: "Turn on 2-Step Verification (mandatory for App Passwords)." },
              { step: "3", title: "Create Token", text: "Generate a custom App Password; copy the generated 16-character token." },
              { step: "4", title: "Inject Defaults", text: "Click 'Fill Gmail defaults' below and paste your 16-char token in the password field." },
              { step: "5", title: "Diagnose Link", text: "Validate setup using the Connection Checks panel below." }
            ].map((item, idx) => (
              <div key={idx} className="bg-[#F8F9FC] border border-gray-100 rounded-xl p-3.5 space-y-2 relative">
                <span className="absolute right-3.5 top-3 text-xs font-mono font-bold text-gray-300">#{item.step}</span>
                <h4 className="text-xs font-bold text-[#0D1E36]">{item.title}</h4>
                <p className="text-[11px] text-gray-500 leading-relaxed">{item.text}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-gray-100">
            <button 
              type="button" 
              className="inline-flex items-center px-4 py-2 justify-center gap-1.5 bg-[#D97706] hover:bg-[#C26405] text-white text-xs font-semibold rounded-lg shadow-sm transition-all duration-150" 
              onClick={fillGmailDefaults}
            >
              Fill Gmail defaults (tidyflaw@gmail.com)
            </button>
            <div className="inline-flex items-start gap-1.5 text-[11px] text-amber-800 bg-[#FEF3C7] border border-amber-200 p-2.5 rounded-lg max-w-xl">
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                Do not use normal account passwords. App passwords bypass typical Google IMAP blocks securely. (Port <strong className="font-mono">993</strong>/Host <strong className="font-mono">imap.gmail.com</strong>)
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Diagnostics Verification Center */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-5">
        <div className="border-b border-gray-100 pb-3 flex items-center justify-between">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#0D1E36]">Connection Diagnostics</h3>
            <p className="text-[11px] text-gray-400">Save active parameters before testing</p>
          </div>
          <span className="text-[9px] font-bold text-[#D97706] bg-[#FEF3C7] px-2 py-0.5 rounded-full uppercase">Runtime Checks</span>
        </div>

        {testing && <ProgressBar label={`Executing system test: ${testing.replace(/_/g, " ")}...`} indeterminate />}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div className="md:col-span-3 space-y-1.5">
            <label className="block text-[10px] font-bold text-[#0D1E36] uppercase tracking-wider">Test Destination Recipient</label>
            <input
              className={`${inputCls} focus:border-[#D97706]`}
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              placeholder="tidyflaw@gmail.com"
            />
          </div>
          <button 
            type="button" 
            className="w-full inline-flex items-center px-4 py-2 justify-center gap-1.5 bg-[#0D1E36] hover:bg-[#142944] text-white text-xs font-semibold rounded-lg shadow-sm transition-all h-[38px]"
            disabled={!!testing}
            onClick={() => runTest("test_all")}
          >
            Run Brevo + Resend + IMAP
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pt-1">
          <button type="button" className={`${btnSecondary} text-xs py-2`} disabled={!!testing} onClick={() => runTest("test_smtp")}>
            <Mail className="w-3.5 h-3.5 text-[#D97706]" /> Test Brevo SMTP
          </button>
          <button type="button" className={`${btnSecondary} text-xs py-2`} disabled={!!testing} onClick={() => runTest("test_resend_smtp")}>
            <Mail className="w-3.5 h-3.5 text-[#D97706]" /> Test Resend SMTP
          </button>
          <button type="button" className={`${btnSecondary} text-xs py-2`} disabled={!!testing} onClick={() => runTest("test_imap")}>
            <Inbox className="w-3.5 h-3.5 text-[#D97706]" /> Test IMAP (Gmail)
          </button>
          <button
            type="button"
            className={`${btnSecondary} text-xs py-2`}
            disabled={!!testing || !testTo}
            onClick={() => runTest("test_send")}
          >
            <Mail className="w-3.5 h-3.5 text-[#D97706]" /> Send via Brevo
          </button>
          <button
            type="button"
            className={`${btnSecondary} text-xs py-2`}
            disabled={!!testing || !testTo}
            onClick={() => runTest("test_resend_send")}
          >
            <Mail className="w-3.5 h-3.5 text-[#D97706]" /> Send via Resend
          </button>
          <button
            type="button"
            className={`${btnSecondary} text-xs py-2`}
            disabled={!!testing}
            onClick={() => runTest("test_reply_sync")}
          >
            <Inbox className="w-3.5 h-3.5 text-[#D97706]" /> Test reply sync
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <ResultCard result={testSmtp} />
          <ResultCard result={testResendSmtp} />
          <ResultCard result={testSend} />
          <ResultCard result={testResendSend} />
          <ResultCard result={testImap} />
          <ResultCard result={testSync} />
        </div>

        {/* Debug Help Area */}
        <div className="rounded-xl bg-slate-50 border border-gray-100 p-4 text-[11px] text-slate-600 space-y-3">
          <div>
            <p className="font-bold text-[#0D1E36] uppercase tracking-wider text-[9px] mb-2">Brevo (primary)</p>
            <ul className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <li className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#D97706]" />
                <span>Host: <code className="bg-white px-1.5 py-0.5 rounded border text-[10px] font-mono">smtp-relay.brevo.com</code></span>
              </li>
              <li className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#D97706]" />
                <span>Port: <code className="bg-white px-1.5 py-0.5 rounded border text-[10px] font-mono">587</code></span>
              </li>
              <li className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#D97706]" />
                <span>Domain: Must match verified sender</span>
              </li>
            </ul>
          </div>
          <div>
            <p className="font-bold text-[#0D1E36] uppercase tracking-wider text-[9px] mb-2">Resend (fallback)</p>
            <ul className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <li className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#D97706]" />
                <span>Host: <code className="bg-white px-1.5 py-0.5 rounded border text-[10px] font-mono">smtp.resend.com</code></span>
              </li>
              <li className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#D97706]" />
                <span>User: <code className="bg-white px-1.5 py-0.5 rounded border text-[10px] font-mono">resend</code> · Pass: API key</span>
              </li>
              <li className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#D97706]" />
                <span>Logs: <a className="underline text-[#0D1E36]" href="https://resend.com/emails" target="_blank" rel="noreferrer">resend.com/emails</a></span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* SMTP Sending Configuration */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
        <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
          <Mail className="w-4 h-4 text-[#D97706]" />
          <h3 className="text-xs font-bold text-[#0D1E36] uppercase tracking-wider">Brevo SMTP Settings</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="block text-[10px] font-bold text-[#0D1E36] uppercase tracking-wider">SMTP Host</label>
            <input
              className={`${inputCls} focus:border-[#D97706]`}
              value={form.smtpHost}
              onChange={(e) => setForm({ ...form, smtpHost: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-[10px] font-bold text-[#0D1E36] uppercase tracking-wider">SMTP Port</label>
            <input
              className={`${inputCls} focus:border-[#D97706]`}
              value={form.smtpPort}
              onChange={(e) => setForm({ ...form, smtpPort: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-[10px] font-bold text-[#0D1E36] uppercase tracking-wider">Username</label>
            <input
              className={`${inputCls} focus:border-[#D97706]`}
              value={form.smtpUsername}
              onChange={(e) => setForm({ ...form, smtpUsername: e.target.value })}
            />
          </div>
          <SavedSecretField
            label="Password"
            hasSaved={!!data?.smtp?.hasPassword}
            editing={!!editSecrets.smtpPassword}
            onEdit={() => startEditSecret("smtpPassword")}
            onCancel={() => cancelEditSecret("smtpPassword")}
            value={form.smtpPassword || ""}
            onChange={(v) => setForm({ ...form, smtpPassword: v })}
            placeholder="Brevo SMTP key"
          />
          <div className="md:col-span-2 space-y-1.5">
            <label className="block text-[10px] font-bold text-[#0D1E36] uppercase tracking-wider">From Sender Address (Brevo Verified Only)</label>
            <input
              className={`${inputCls} focus:border-[#D97706]`}
              value={form.senderEmail}
              onChange={(e) => setForm({ ...form, senderEmail: e.target.value })}
              placeholder="e.g. hello@yourdomain.com"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-[10px] font-bold text-[#0D1E36] uppercase tracking-wider">Sender Display Name</label>
            <input
              className={`${inputCls} focus:border-[#D97706]`}
              value={form.senderName}
              onChange={(e) => setForm({ ...form, senderName: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-[10px] font-bold text-[#0D1E36] uppercase tracking-wider">Reply-To Address (Gmail Target)</label>
            <input
              className={`${inputCls} focus:border-[#D97706]`}
              value={form.replyToEmail}
              onChange={(e) => setForm({ ...form, replyToEmail: e.target.value })}
              placeholder="tidyflaw@gmail.com"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-[10px] font-bold text-[#0D1E36] uppercase tracking-wider">Daily Outbound Cap</label>
            <input
              className={`${inputCls} focus:border-[#D97706]`}
              type="number"
              value={form.dailyEmailLimit}
              onChange={(e) => setForm({ ...form, dailyEmailLimit: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-[10px] font-bold text-[#0D1E36] uppercase tracking-wider">Hourly Throttle Cap</label>
            <input
              className={`${inputCls} focus:border-[#D97706]`}
              type="number"
              value={form.hourlyEmailLimit}
              onChange={(e) => setForm({ ...form, hourlyEmailLimit: e.target.value })}
            />
          </div>
        </div>
        <CardSaveButton
          saving={saving}
          section="brevo"
          label="Save Brevo settings"
          onClick={() =>
            saveSection(
              "brevo",
              [
                "smtpHost",
                "smtpPort",
                "smtpUsername",
                "smtpPassword",
                "senderEmail",
                "senderName",
                "replyToEmail",
                "dailyEmailLimit",
                "hourlyEmailLimit",
              ],
              "Brevo SMTP settings saved"
            )
          }
        />
      </div>

      {/* Resend SMTP Fallback */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Mail className="w-4 h-4 text-[#D97706]" />
            <h3 className="text-xs font-bold text-[#0D1E36] uppercase tracking-wider">Resend SMTP Fallback</h3>
          </div>
          <label className="flex items-center gap-2 text-xs font-semibold text-[#0D1E36] select-none cursor-pointer">
            <input
              type="checkbox"
              className="accent-[#0D1E36] rounded border-gray-300 w-4 h-4 cursor-pointer"
              checked={!!form.resendEnabled}
              onChange={(e) => setForm({ ...form, resendEnabled: e.target.checked })}
            />
            Use Resend when Brevo fails
          </label>
        </div>

        <p className="text-[11px] text-slate-500 leading-relaxed">
          Primary sends use Brevo. If Brevo returns an error or rate/limit failure, delivery automatically retries via{" "}
          <a className="underline text-[#0D1E36]" href="https://resend.com/docs/send-with-smtp" target="_blank" rel="noreferrer">
            Resend SMTP
          </a>
          . Your domain must already be verified in Resend. View sends in the{" "}
          <a className="underline text-[#0D1E36]" href="https://resend.com/emails" target="_blank" rel="noreferrer">
            Resend emails dashboard
          </a>
          .
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="block text-[10px] font-bold text-[#0D1E36] uppercase tracking-wider">SMTP Host</label>
            <input
              className={`${inputCls} focus:border-[#D97706]`}
              value={form.resendHost || ""}
              onChange={(e) => setForm({ ...form, resendHost: e.target.value })}
              placeholder="smtp.resend.com"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-[10px] font-bold text-[#0D1E36] uppercase tracking-wider">SMTP Port</label>
            <input
              className={`${inputCls} focus:border-[#D97706]`}
              value={form.resendPort || ""}
              onChange={(e) => setForm({ ...form, resendPort: e.target.value })}
              placeholder="587"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-[10px] font-bold text-[#0D1E36] uppercase tracking-wider">Username</label>
            <input
              className={`${inputCls} focus:border-[#D97706]`}
              value={form.resendUsername || "resend"}
              onChange={(e) => setForm({ ...form, resendUsername: e.target.value })}
              placeholder="resend"
            />
          </div>
          <SavedSecretField
            label="API Key (SMTP password)"
            hasSaved={!!data?.resend?.hasApiKey}
            editing={!!editSecrets.resendApiKey}
            onEdit={() => startEditSecret("resendApiKey")}
            onCancel={() => cancelEditSecret("resendApiKey")}
            value={form.resendApiKey || ""}
            onChange={(v) => setForm({ ...form, resendApiKey: v })}
            placeholder="Resend API key"
          />
          <div className="md:col-span-2 space-y-1.5">
            <label className="block text-[10px] font-bold text-[#0D1E36] uppercase tracking-wider">
              From Address (Resend verified domain)
            </label>
            <input
              className={`${inputCls} focus:border-[#D97706]`}
              value={form.resendSenderEmail || ""}
              onChange={(e) => setForm({ ...form, resendSenderEmail: e.target.value })}
              placeholder="e.g. hello@yourdomain.com"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-[10px] font-bold text-[#0D1E36] uppercase tracking-wider">Sender Display Name</label>
            <input
              className={`${inputCls} focus:border-[#D97706]`}
              value={form.resendSenderName || ""}
              onChange={(e) => setForm({ ...form, resendSenderName: e.target.value })}
            />
          </div>
          <div className="flex items-end">
            <button
              type="button"
              className={`${btnSecondary} text-xs py-2 w-full`}
              onClick={() =>
                setForm((prev: any) => ({
                  ...prev,
                  resendEnabled: true,
                  resendHost: "smtp.resend.com",
                  resendPort: 587,
                  resendUsername: "resend",
                  resendSenderEmail: prev.resendSenderEmail || prev.senderEmail || "",
                  resendSenderName: prev.resendSenderName || prev.senderName || "TidyFlow",
                }))
              }
            >
              Fill Resend defaults
            </button>
          </div>
        </div>
        <CardSaveButton
          saving={saving}
          section="resend"
          label="Save Resend settings"
          onClick={() =>
            saveSection(
              "resend",
              [
                "resendEnabled",
                "resendHost",
                "resendPort",
                "resendUsername",
                "resendApiKey",
                "resendSenderEmail",
                "resendSenderName",
              ],
              "Resend SMTP settings saved"
            )
          }
        />
      </div>

      {/* IMAP Receiving Configuration */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Inbox className="w-4 h-4 text-[#D97706]" />
            <h3 className="text-xs font-bold text-[#0D1E36] uppercase tracking-wider">Gmail IMAP Synchronization</h3>
          </div>
          
          <label className="flex items-center gap-2 text-xs font-semibold text-[#0D1E36] select-none cursor-pointer">
            <input
              type="checkbox"
              className="accent-[#0D1E36] rounded border-gray-300 w-4 h-4 cursor-pointer"
              checked={!!form.replyImapEnabled}
              onChange={(e) => setForm({ ...form, replyImapEnabled: e.target.checked })}
            />
            Enable IMAP synchronization
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="block text-[10px] font-bold text-[#0D1E36] uppercase tracking-wider">IMAP Host</label>
            <input
              className={`${inputCls} focus:border-[#D97706]`}
              value={form.replyImapHost}
              onChange={(e) => setForm({ ...form, replyImapHost: e.target.value })}
              placeholder="imap.gmail.com"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-[10px] font-bold text-[#0D1E36] uppercase tracking-wider">IMAP Connection Port</label>
            <input
              className={`${inputCls} focus:border-[#D97706]`}
              value={form.replyImapPort}
              onChange={(e) => setForm({ ...form, replyImapPort: e.target.value })}
              placeholder="993"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-[10px] font-bold text-[#0D1E36] uppercase tracking-wider">Username Address</label>
            <input
              className={`${inputCls} focus:border-[#D97706]`}
              value={form.replyImapUser}
              onChange={(e) => setForm({ ...form, replyImapUser: e.target.value })}
              placeholder="tidyflaw@gmail.com"
            />
          </div>
          <SavedSecretField
            label="Secure App Password"
            hasSaved={!!data?.replyInbox?.hasPassword}
            editing={!!editSecrets.replyImapPassword}
            onEdit={() => startEditSecret("replyImapPassword")}
            onCancel={() => cancelEditSecret("replyImapPassword")}
            value={form.replyImapPassword || ""}
            onChange={(v) => setForm({ ...form, replyImapPassword: v })}
            placeholder="16-character Google App Password"
          />
        </div>

        <div className="pt-3 border-t border-gray-100 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            className={`${btnSecondary} text-xs inline-flex items-center gap-1.5 hover:bg-slate-50`}
            onClick={async () => {
              try {
                await saPost("/settings", { action: "sync_replies" })
                setMessage({ type: "success", text: "Gmail poll request dispatched. Reviewing inbound replies..." })
              } catch (e: any) {
                setMessage({ type: "error", text: e.message })
              }
            }}
          >
            <RefreshCw className="w-3.5 h-3.5 text-[#D97706]" /> Synchronize replies now
          </button>
          <button
            type="button"
            className="inline-flex items-center px-4 py-2 justify-center bg-[#0D1E36] hover:bg-[#142944] text-white text-xs font-semibold rounded-lg shadow-sm transition-all duration-150 disabled:opacity-50"
            disabled={!!saving}
            onClick={() =>
              saveSection(
                "imap",
                [
                  "replyToEmail",
                  "replyImapEnabled",
                  "replyImapHost",
                  "replyImapPort",
                  "replyImapUser",
                  "replyImapPassword",
                  "replyImapTls",
                ],
                "Gmail IMAP settings saved"
              )
            }
          >
            {saving === "imap" ? "Saving…" : "Save IMAP settings"}
          </button>
        </div>
      </div>

      {/* Default Template Variables */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
        <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
          <FileText className="w-4 h-4 text-[#D97706]" />
          <h3 className="text-xs font-bold text-[#0D1E36] uppercase tracking-wider">Dynamic Variable Fallbacks</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="block text-[10px] font-bold text-[#0D1E36] uppercase tracking-wider">Contact Name Fallback</label>
            <input
              className={`${inputCls} focus:border-[#D97706]`}
              value={form.defaultContactName || ""}
              onChange={(e) => setForm({ ...form, defaultContactName: e.target.value })}
              placeholder="e.g. Operations Manager"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-[10px] font-bold text-[#0D1E36] uppercase tracking-wider">Business Name Fallback</label>
            <input
              className={`${inputCls} focus:border-[#D97706]`}
              value={form.defaultCompanyName || ""}
              onChange={(e) => setForm({ ...form, defaultCompanyName: e.target.value })}
              placeholder="Fallback name"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-[10px] font-bold text-[#0D1E36] uppercase tracking-wider">Default Location Context</label>
            <input
              className={`${inputCls} focus:border-[#D97706]`}
              value={form.defaultCity || ""}
              onChange={(e) => setForm({ ...form, defaultCity: e.target.value })}
              placeholder="Default city"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-[10px] font-bold text-[#0D1E36] uppercase tracking-wider">Default Domain/Service Context</label>
            <input
              className={`${inputCls} focus:border-[#D97706]`}
              value={form.defaultServices || ""}
              onChange={(e) => setForm({ ...form, defaultServices: e.target.value })}
              placeholder="e.g. commercial sanitation"
            />
          </div>
          <div className="md:col-span-2 space-y-1.5">
            <label className="block text-[10px] font-bold text-[#0D1E36] uppercase tracking-wider">Fallback Personalized Introduction (Pre-Analysis)</label>
            <textarea
              className={`${inputCls} focus:border-[#D97706]`}
              rows={2}
              value={form.defaultPersonalizedIntro || ""}
              onChange={(e) => setForm({ ...form, defaultPersonalizedIntro: e.target.value })}
              placeholder="Default introduction phrasing"
            />
          </div>
        </div>
        <CardSaveButton
          saving={saving}
          section="templates"
          label="Save template defaults"
          onClick={() =>
            saveSection(
              "templates",
              [
                "defaultContactName",
                "defaultCompanyName",
                "defaultCity",
                "defaultServices",
                "defaultPersonalizedIntro",
              ],
              "Template defaults saved"
            )
          }
        />
      </div>

      {/* Lead Discovery Engine */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
        <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
          <Database className="w-4 h-4 text-[#D97706]" />
          <h3 className="text-xs font-bold text-[#0D1E36] uppercase tracking-wider">Lead Discovery Parameters</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <SavedSecretField
              label="Google Places API Authorization Key"
              hasSaved={!!data?.discovery?.hasGooglePlacesKey}
              editing={!!editSecrets.googlePlacesApiKey}
              onEdit={() => startEditSecret("googlePlacesApiKey")}
              onCancel={() => cancelEditSecret("googlePlacesApiKey")}
              value={form.googlePlacesApiKey || ""}
              onChange={(v) => setForm({ ...form, googlePlacesApiKey: v })}
              placeholder="Google Places API key"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-[10px] font-bold text-[#0D1E36] uppercase tracking-wider">Active Search Engine</label>
            <input
              className={`${inputCls} focus:border-[#D97706]`}
              value={form.searchEngine}
              onChange={(e) => setForm({ ...form, searchEngine: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-[10px] font-bold text-[#0D1E36] uppercase tracking-wider">Throttle Delay Between Queries (ms)</label>
            <input
              className={`${inputCls} focus:border-[#D97706]`}
              type="number"
              value={form.searchDelayMs}
              onChange={(e) => setForm({ ...form, searchDelayMs: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-[10px] font-bold text-[#0D1E36] uppercase tracking-wider">Max Ingest Results Limit</label>
            <input
              className={`${inputCls} focus:border-[#D97706]`}
              type="number"
              value={form.maxResults}
              onChange={(e) => setForm({ ...form, maxResults: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-[10px] font-bold text-[#0D1E36] uppercase tracking-wider">Concurrent Thread Allocation</label>
            <input
              className={`${inputCls} focus:border-[#D97706]`}
              type="number"
              value={form.concurrentWorkers}
              onChange={(e) => setForm({ ...form, concurrentWorkers: e.target.value })}
            />
          </div>
          <div className="md:col-span-2 space-y-1.5">
            <label className="block text-[10px] font-bold text-[#0D1E36] uppercase tracking-wider">Company Core Booking URL</label>
            <input
              className={`${inputCls} focus:border-[#D97706]`}
              value={form.bookingLink}
              onChange={(e) => setForm({ ...form, bookingLink: e.target.value })}
            />
          </div>
        </div>

        <CardSaveButton
          saving={saving}
          section="discovery"
          label="Save discovery settings"
          onClick={() =>
            saveSection(
              "discovery",
              [
                "googlePlacesApiKey",
                "searchEngine",
                "searchDelayMs",
                "maxResults",
                "concurrentWorkers",
                "bookingLink",
              ],
              "Lead discovery settings saved"
            )
          }
        />
      </div>

      {/* Scheduled Automation Parameters */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
        <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
          <Clock className="w-4 h-4 text-[#D97706]" />
          <h3 className="text-xs font-bold text-[#0D1E36] uppercase tracking-wider">Scheduled Operations Automation</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="block text-[10px] font-bold text-[#0D1E36] uppercase tracking-wider">Operation Name</label>
            <input
              className={`${inputCls} focus:border-[#D97706]`}
              value={jobForm.name}
              onChange={(e) => setJobForm({ ...jobForm, name: e.target.value })}
              placeholder="e.g. Daily Discovery Task"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-[10px] font-bold text-[#0D1E36] uppercase tracking-wider">Execution Pipeline Type</label>
            <select
              className={`${inputCls} focus:border-[#D97706]`}
              value={jobForm.jobType}
              onChange={(e) => setJobForm({ ...jobForm, jobType: e.target.value })}
            >
              <option value="lead_discovery">Lead Discovery</option>
              <option value="website_analysis">Website Analysis</option>
              <option value="email_sending">Email Sending</option>
              <option value="follow_up">Outbound Follow-ups</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="block text-[10px] font-bold text-[#0D1E36] uppercase tracking-wider">Cron Schedule Formula</label>
            <input
              className={`${inputCls} focus:border-[#D97706]`}
              value={jobForm.cronExpression}
              onChange={(e) => setJobForm({ ...jobForm, cronExpression: e.target.value })}
              placeholder="0 9 * * *"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-[10px] font-bold text-[#0D1E36] uppercase tracking-wider">Or Set Single Execution Timestamp</label>
            <input
              className={`${inputCls} focus:border-[#D97706]`}
              type="datetime-local"
              value={jobForm.runAt}
              onChange={(e) => setJobForm({ ...jobForm, runAt: e.target.value })}
            />
          </div>
          <div className="md:col-span-2 space-y-1.5">
            <label className="block text-[10px] font-bold text-[#0D1E36] uppercase tracking-wider">Keyword Targets (Comma Separated)</label>
            <input
              className={`${inputCls} focus:border-[#D97706]`}
              value={jobForm.keyword}
              onChange={(e) => setJobForm({ ...jobForm, keyword: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-[10px] font-bold text-[#0D1E36] uppercase tracking-wider">Country Constraints</label>
            <input
              className={`${inputCls} focus:border-[#D97706]`}
              value={jobForm.countries}
              onChange={(e) => setJobForm({ ...jobForm, countries: e.target.value })}
              placeholder="UAE, Germany, USA"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-[10px] font-bold text-[#0D1E36] uppercase tracking-wider">City Constraints (Optional)</label>
            <input
              className={`${inputCls} focus:border-[#D97706]`}
              value={jobForm.cities}
              onChange={(e) => setJobForm({ ...jobForm, cities: e.target.value })}
            />
          </div>
        </div>

        <button
          type="button"
          className="inline-flex items-center justify-center gap-1.5 bg-[#0D1E36] hover:bg-[#142944] text-white text-xs font-semibold px-4 py-2.5 rounded-lg shadow-sm transition-all"
          onClick={async () => {
            try {
              const keywords = jobForm.keyword.split(/[,;]+/).map((s) => s.trim()).filter(Boolean)
              const countries = jobForm.countries.split(/[,;]+/).map((s) => s.trim()).filter(Boolean)
              const cities = jobForm.cities.split(/[,;]+/).map((s) => s.trim()).filter(Boolean)
              await saPost("/scheduler", {
                name: jobForm.name || `${jobForm.jobType} execution`,
                jobType: jobForm.jobType,
                cronExpression: jobForm.cronExpression || null,
                runAt: jobForm.runAt || null,
                config: {
                  keywords,
                  countries,
                  cities,
                  method: "google_places",
                },
              })
              setMessage({ type: "success", text: "Scheduler pipeline task created successfully" })
              load()
            } catch (e: any) {
              setMessage({ type: "error", text: e.message })
            }
          }}
        >
          <Plus className="w-4 h-4 text-[#D97706]" /> Enqueue Automation Task
        </button>

        {/* Existing Automation List */}
        {jobs.length === 0 ? (
          <EmptyState title="No scheduled pipelines" />
        ) : (
          <div className="border border-[#EEF0F5] rounded-xl overflow-hidden mt-4">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="text-gray-500 text-[10px] font-bold uppercase tracking-wider bg-slate-50 border-b border-gray-200">
                  <th className="p-4 pl-5">Pipeline Name</th>
                  <th className="p-4">Type</th>
                  <th className="p-4">Cron / Runtime Spec</th>
                  <th className="p-4">Last Run Execution</th>
                  <th className="p-4 text-right pr-5">Execution controls</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {jobs.map((j) => (
                  <tr key={j.id} className="hover:bg-[#F8F9FC] transition-colors duration-100">
                    <td className="p-4 pl-5 font-bold text-[#0D1E36]">{j.name}</td>
                    <td className="p-4">
                      <span className="inline-block text-[10px] px-2 py-0.5 rounded-full bg-[#EEF0F5] text-slate-700 font-semibold uppercase tracking-wider">
                        {j.jobType}
                      </span>
                    </td>
                    <td className="p-4 font-mono text-gray-500">
                      {j.cronExpression || (j.runAt ? new Date(j.runAt).toLocaleString() : "—")}
                    </td>
                    <td className="p-4 text-gray-400">
                      {j.lastRunAt ? new Date(j.lastRunAt).toLocaleString() : "Never Executed"}
                    </td>
                    <td className="p-4 text-right pr-5">
                      <div className="inline-flex items-center gap-3 justify-end">
                        <button
                          type="button"
                          className="text-[#0D1E36] hover:text-[#D97706] text-xs font-semibold inline-flex items-center gap-1 transition-colors"
                          onClick={async () => {
                            await saPost("/scheduler", { action: "run_now", id: j.id })
                            setMessage({ type: "success", text: "Automation task started." })
                          }}
                        >
                          <Play className="w-3.5 h-3.5 text-[#D97706]" /> Run now
                        </button>
                        <button
                          type="button"
                          className="text-rose-600 hover:text-rose-800 text-xs font-semibold inline-flex items-center gap-1 transition-colors"
                          onClick={async () => {
                            if (!window.confirm(`Delete scheduled job "${j.name}"?`)) return
                            try {
                              await saDelete("/scheduler", { id: j.id })
                              setMessage({ type: "success", text: "Scheduled job deleted" })
                              load()
                            } catch (e: any) {
                              setMessage({ type: "error", text: e.message })
                            }
                          }}
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
