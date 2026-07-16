"use client"

import { useEffect, useState } from "react"
import {
  saGet,
  saPut,
  saPost,
  LoadingBlock,
  MessageBanner,
  EmptyState,
  btnPrimary,
  btnSecondary,
  inputCls,
  ProgressBar,
} from "./shared"
import { Plus, Play, CheckCircle2, XCircle, Mail, Inbox } from "lucide-react"

function ResultCard({ result }: { result: any }) {
  if (!result) return null
  const ok = !!result.ok
  return (
    <div
      className={`rounded-lg border px-3 py-2.5 text-sm ${
        ok ? "bg-green-50 border-green-200 text-green-900" : "bg-red-50 border-red-200 text-red-900"
      }`}
    >
      <div className="flex items-start gap-2">
        {ok ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> : <XCircle className="w-4 h-4 mt-0.5 shrink-0" />}
        <div className="min-w-0 space-y-1">
          <p className="font-medium">{result.message || result.error || (ok ? "OK" : "Failed")}</p>
          {result.warning && (
            <p className="text-xs rounded bg-amber-100/80 text-amber-950 border border-amber-200 px-2 py-1.5">
              {result.warning}
            </p>
          )}
          {result.fromEmail && (
            <p className="text-xs">
              <strong>From:</strong> {result.fromEmail}
              {result.replyToEmail ? (
                <>
                  {" "}
                  · <strong>Reply-To:</strong> {result.replyToEmail}
                </>
              ) : null}
            </p>
          )}
          {result.smtpResponse && (
            <p className="text-xs font-mono break-all opacity-80">SMTP: {String(result.smtpResponse)}</p>
          )}
          {result.messageId && (
            <p className="text-xs font-mono break-all opacity-80">Message-ID: {result.messageId}</p>
          )}
          {result.hint && <p className="text-xs opacity-90">{result.hint}</p>}
          {result.tip && <p className="text-xs opacity-90">{result.tip}</p>}
          {Array.isArray(result.nextSteps) && (
            <ol className="text-xs list-decimal ml-4 space-y-0.5">
              {result.nextSteps.map((s: string, i: number) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          )}
          {result.imap?.unseen != null && (
            <p className="text-xs">
              Inbox: {result.imap.messages} messages · {result.imap.unseen} unread
            </p>
          )}
          {result.imported != null && (
            <p className="text-xs">
              Checked {result.checked} · imported {result.imported} · skipped {result.skipped}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

export default function SettingsTab() {
  const [data, setData] = useState<any>(null)
  const [form, setForm] = useState<any>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [jobs, setJobs] = useState<any[]>([])
  const [testTo, setTestTo] = useState("tidyflaw@gmail.com")
  const [testing, setTesting] = useState<string | null>(null)
  const [testSmtp, setTestSmtp] = useState<any>(null)
  const [testImap, setTestImap] = useState<any>(null)
  const [testSend, setTestSend] = useState<any>(null)
  const [testSync, setTestSync] = useState<any>(null)
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
      })
      if (settings.smtp.replyToEmail) setTestTo(settings.smtp.replyToEmail)
    } catch (e: any) {
      setMessage({ type: "error", text: e.message })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const save = async () => {
    setSaving(true)
    try {
      const payload = { ...form }
      if (!payload.smtpPassword || payload.smtpPassword.startsWith("••")) delete payload.smtpPassword
      if (!payload.replyImapPassword || payload.replyImapPassword.startsWith("••")) delete payload.replyImapPassword
      if (!payload.googlePlacesApiKey || payload.googlePlacesApiKey.startsWith("••")) delete payload.googlePlacesApiKey
      payload.replyImapEnabled = !!payload.replyImapEnabled
      payload.replyImapTls = true
      await saPut("/settings", payload)
      setMessage({ type: "success", text: "Settings saved" })
      load()
    } catch (e: any) {
      setMessage({ type: "error", text: e.message })
    } finally {
      setSaving(false)
    }
  }

  const runTest = async (action: string) => {
    setTesting(action)
    setMessage(null)
    const timeouts: Record<string, number> = {
      test_smtp: 20000,
      test_imap: 25000,
      test_send: 45000,
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
      if (action === "test_imap") setTestImap(result)
      if (action === "test_send") setTestSend(result)
      if (action === "test_reply_sync") setTestSync(result)
      if (action === "test_all") {
        setTestSmtp(result.smtp)
        setTestImap(result.imap)
        if (result.send) setTestSend(result.send)
      }
      const failed =
        result.ok === false || result.smtp?.ok === false || result.imap?.ok === false
      setMessage({
        type: failed ? "error" : "success",
        text:
          result.message ||
          result.error ||
          (action === "test_all"
            ? `Diagnostics: SMTP ${result.smtp?.ok ? "OK" : "FAIL"} · IMAP ${result.imap?.ok ? "OK" : "FAIL"}`
            : "Test finished"),
      })
    } catch (e: any) {
      const timedOut =
        e?.code === "ECONNABORTED" ||
        /timeout/i.test(e?.message || "") ||
        e?.message === "Network Error"
      const errText = timedOut
        ? "Test timed out — SMTP/IMAP did not respond. Check host (smtp-relay.brevo.com), port 587, SMTP key, and that outbound SMTP is not blocked on this server."
        : e?.response?.data?.message || e.message || "Test failed"
      if (action === "test_smtp") setTestSmtp({ ok: false, error: errText })
      if (action === "test_imap") setTestImap({ ok: false, error: errText })
      if (action === "test_send") setTestSend({ ok: false, error: errText })
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
      text: "Filled Gmail defaults for tidyflaw@gmail.com — paste your App Password, then Save.",
    })
  }

  if (loading) return <LoadingBlock />

  return (
    <div className="space-y-6">
      <MessageBanner message={message} />

      <div className="bg-white rounded-xl border border-sky-200 shadow-sm p-5 space-y-3">
        <h3 className="text-sm font-semibold text-gray-900">How to set up Gmail for reply tracking</h3>
        <p className="text-sm text-gray-600">
          Use <strong>tidyflaw@gmail.com</strong> as Reply-To + IMAP. Brevo only <em>sends</em>; when a lead hits
          Reply, the message lands in your Gmail and we sync it into the Sales Agent.
        </p>
        <ol className="text-sm text-gray-700 space-y-2 list-decimal ml-5">
          <li>
            Open{" "}
            <a
              className="text-indigo-600 underline"
              href="https://myaccount.google.com/security"
              target="_blank"
              rel="noreferrer"
            >
              Google Account → Security
            </a>{" "}
            while signed in as <code className="bg-gray-100 px-1 rounded text-xs">tidyflaw@gmail.com</code>.
          </li>
          <li>
            Turn on <strong>2-Step Verification</strong> (required for App Passwords).
          </li>
          <li>
            Go to{" "}
            <a
              className="text-indigo-600 underline"
              href="https://myaccount.google.com/apppasswords"
              target="_blank"
              rel="noreferrer"
            >
              App passwords
            </a>{" "}
            → create one named <em>TidyFlow Sales Agent</em> → copy the 16-character password.
          </li>
          <li>
            Click <strong>Fill Gmail defaults</strong> below, paste the App Password into the IMAP field, then{" "}
            <strong>Save Settings</strong>.
          </li>
          <li>
            Use <strong>Testing tools</strong>: Test SMTP → Test IMAP → Send test email → Reply to it → Test reply
            sync.
          </li>
        </ol>
        <button type="button" className={btnSecondary} onClick={fillGmailDefaults}>
          Fill Gmail defaults (tidyflaw@gmail.com)
        </button>
        <div className="rounded-lg bg-amber-50 border border-amber-100 px-3 py-2 text-xs text-amber-900">
          Do <strong>not</strong> use your normal Gmail password for IMAP — only the App Password. Host{" "}
          <code className="bg-white/80 px-1 rounded">imap.gmail.com</code> port{" "}
          <code className="bg-white/80 px-1 rounded">993</code>.
        </div>
      </div>

      <div className="bg-white rounded-xl border border-indigo-200 shadow-sm p-5 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Testing tools</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Save settings first, then verify send + reply tracking end-to-end.
          </p>
        </div>

        {testing && <ProgressBar label={`Running ${testing.replace(/_/g, " ")}…`} indeterminate />}

        <div className="flex flex-wrap gap-2 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="text-xs font-medium text-gray-600">Send test email to</label>
            <input
              className={inputCls}
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              placeholder="tidyflaw@gmail.com"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="button" className={btnSecondary} disabled={!!testing} onClick={() => runTest("test_smtp")}>
            <Mail className="w-4 h-4" /> Test SMTP (Brevo)
          </button>
          <button type="button" className={btnSecondary} disabled={!!testing} onClick={() => runTest("test_imap")}>
            <Inbox className="w-4 h-4" /> Test IMAP (Gmail)
          </button>
          <button
            type="button"
            className={btnPrimary}
            disabled={!!testing || !testTo}
            onClick={() => runTest("test_send")}
          >
            <Mail className="w-4 h-4" /> Send test email
          </button>
          <button
            type="button"
            className={btnSecondary}
            disabled={!!testing}
            onClick={() => runTest("test_reply_sync")}
          >
            <Inbox className="w-4 h-4" /> Test reply sync
          </button>
          <button type="button" className={btnSecondary} disabled={!!testing} onClick={() => runTest("test_all")}>
            Run SMTP + IMAP check
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <ResultCard result={testSmtp} />
          <ResultCard result={testImap} />
          <ResultCard result={testSend} />
          <ResultCard result={testSync} />
        </div>

        <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-xs text-slate-700 space-y-1">
          <p className="font-medium text-slate-900">Brevo SMTP checklist (if test hangs or fails)</p>
          <ul className="list-disc ml-4 space-y-0.5">
            <li>
              Host <code className="bg-white px-1 rounded">smtp-relay.brevo.com</code> · Port{" "}
              <code className="bg-white px-1 rounded">587</code>
            </li>
            <li>Username = Brevo login email · Password = <strong>SMTP key</strong> (Settings → SMTP &amp; API), not your account password</li>
            <li>
              From Email = an address on your <strong>verified domain</strong> (e.g. hello@yourdomain.com), then Save
            </li>
          </ul>
        </div>
        <p className="text-xs text-gray-500">
          Full reply test: Send test email → open it → Reply → wait ~1 min → Test reply sync → check Outreach →
          Replies.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
        <h3 className="text-sm font-semibold text-gray-900">Brevo SMTP (send)</h3>
        <p className="text-xs text-gray-500">
          Brevo delivers the email. Set <strong>Reply-To</strong> to your Gmail so when a lead hits Reply, the
          message goes to you — not Brevo.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-gray-600">SMTP Host</label>
            <input
              className={inputCls}
              value={form.smtpHost}
              onChange={(e) => setForm({ ...form, smtpHost: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">SMTP Port</label>
            <input
              className={inputCls}
              value={form.smtpPort}
              onChange={(e) => setForm({ ...form, smtpPort: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Username</label>
            <input
              className={inputCls}
              value={form.smtpUsername}
              onChange={(e) => setForm({ ...form, smtpUsername: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">
              Password {data?.smtp?.hasPassword ? "(set)" : ""}
            </label>
            <input
              type="password"
              className={inputCls}
              placeholder="Leave blank to keep"
              value={form.smtpPassword}
              onChange={(e) => setForm({ ...form, smtpPassword: e.target.value })}
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs font-medium text-gray-600">From Email (Brevo verified sender) *</label>
            <input
              className={inputCls}
              value={form.senderEmail}
              onChange={(e) => setForm({ ...form, senderEmail: e.target.value })}
              placeholder="must be verified in Brevo — e.g. hello@yourdomain.com"
            />
            <p className="text-xs text-amber-700 mt-1 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1.5">
              This must match a <strong>verified sender</strong> in Brevo → Senders &amp; Domains. If it is wrong or
              unverified, SMTP can say “sent” but Gmail never receives the email. Check Spam too.
            </p>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Sender Name</label>
            <input
              className={inputCls}
              value={form.senderName}
              onChange={(e) => setForm({ ...form, senderName: e.target.value })}
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs font-medium text-gray-600">Reply-To Email (your Gmail) *</label>
            <input
              className={inputCls}
              value={form.replyToEmail}
              onChange={(e) => setForm({ ...form, replyToEmail: e.target.value })}
              placeholder="tidyflaw@gmail.com"
            />
            <p className="text-xs text-amber-700 mt-1 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1.5">
              Set this to <strong>tidyflaw@gmail.com</strong>. Customers reply here. Brevo is only used to send.
            </p>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Daily Sending Limit</label>
            <input
              className={inputCls}
              type="number"
              value={form.dailyEmailLimit}
              onChange={(e) => setForm({ ...form, dailyEmailLimit: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Hourly Limit</label>
            <input
              className={inputCls}
              type="number"
              value={form.hourlyEmailLimit}
              onChange={(e) => setForm({ ...form, hourlyEmailLimit: e.target.value })}
            />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
        <h3 className="text-sm font-semibold text-gray-900">Track Gmail replies (IMAP)</h3>
        <p className="text-xs text-gray-500">
          Enable IMAP sync with a Gmail App Password for <strong>tidyflaw@gmail.com</strong>. The worker checks
          every 15 minutes; you can also run sync from Testing tools.
        </p>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={!!form.replyImapEnabled}
            onChange={(e) => setForm({ ...form, replyImapEnabled: e.target.checked })}
          />
          Enable Gmail / IMAP reply sync
        </label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-gray-600">IMAP Host</label>
            <input
              className={inputCls}
              value={form.replyImapHost}
              onChange={(e) => setForm({ ...form, replyImapHost: e.target.value })}
              placeholder="imap.gmail.com"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">IMAP Port</label>
            <input
              className={inputCls}
              value={form.replyImapPort}
              onChange={(e) => setForm({ ...form, replyImapPort: e.target.value })}
              placeholder="993"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">IMAP User</label>
            <input
              className={inputCls}
              value={form.replyImapUser}
              onChange={(e) => setForm({ ...form, replyImapUser: e.target.value })}
              placeholder="tidyflaw@gmail.com"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">
              Gmail App Password {data?.replyInbox?.hasPassword ? "(set)" : ""}
            </label>
            <input
              type="password"
              className={inputCls}
              placeholder="16-char App Password (not your normal password)"
              value={form.replyImapPassword}
              onChange={(e) => setForm({ ...form, replyImapPassword: e.target.value })}
            />
          </div>
        </div>
        <button
          type="button"
          className={btnSecondary}
          onClick={async () => {
            try {
              await saPost("/settings", { action: "sync_replies" })
              setMessage({ type: "success", text: "Reply sync queued — check Replies tab shortly" })
            } catch (e: any) {
              setMessage({ type: "error", text: e.message })
            }
          }}
        >
          Sync replies now (queue)
        </button>
        <p className="text-xs text-gray-400">
          Webhook alternative: POST JSON to{" "}
          <code className="bg-gray-100 px-1 rounded">/api/admin/sales-agent/replies/inbound?secret=…</code> (set
          env <code className="bg-gray-100 px-1 rounded">SALES_AGENT_INBOUND_SECRET</code>).
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
        <h3 className="text-sm font-semibold text-gray-900">Lead Discovery</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="md:col-span-2">
            <label className="text-xs font-medium text-gray-600">
              Google Places API Key {data?.discovery?.hasGooglePlacesKey ? "(configured)" : "(not set)"}
            </label>
            <input
              type="password"
              className={inputCls}
              placeholder="Leave blank to keep"
              value={form.googlePlacesApiKey}
              onChange={(e) => setForm({ ...form, googlePlacesApiKey: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Search Engine</label>
            <input
              className={inputCls}
              value={form.searchEngine}
              onChange={(e) => setForm({ ...form, searchEngine: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Search Delay (ms)</label>
            <input
              className={inputCls}
              type="number"
              value={form.searchDelayMs}
              onChange={(e) => setForm({ ...form, searchDelayMs: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Max Results</label>
            <input
              className={inputCls}
              type="number"
              value={form.maxResults}
              onChange={(e) => setForm({ ...form, maxResults: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Concurrent Workers</label>
            <input
              className={inputCls}
              type="number"
              value={form.concurrentWorkers}
              onChange={(e) => setForm({ ...form, concurrentWorkers: e.target.value })}
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs font-medium text-gray-600">Booking Link</label>
            <input
              className={inputCls}
              value={form.bookingLink}
              onChange={(e) => setForm({ ...form, bookingLink: e.target.value })}
            />
          </div>
        </div>
        <button type="button" className={btnPrimary} disabled={saving} onClick={save}>
          {saving ? "Saving…" : "Save Settings"}
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
        <h3 className="text-sm font-semibold text-gray-900">Schedule (via automation worker)</h3>
        <p className="text-xs text-gray-500">
          Jobs run on the existing <code className="bg-gray-100 px-1 rounded">tidyflow-automation</code> queue
          (same worker as billing cron) — not a separate process.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-gray-600">Job Name</label>
            <input
              className={inputCls}
              value={jobForm.name}
              onChange={(e) => setJobForm({ ...jobForm, name: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Job Type</label>
            <select
              className={inputCls}
              value={jobForm.jobType}
              onChange={(e) => setJobForm({ ...jobForm, jobType: e.target.value })}
            >
              <option value="lead_discovery">Lead Discovery</option>
              <option value="website_analysis">Website Analysis</option>
              <option value="email_sending">Email Sending</option>
              <option value="follow_up">Follow-ups</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Cron (daily/weekly)</label>
            <input
              className={inputCls}
              value={jobForm.cronExpression}
              onChange={(e) => setJobForm({ ...jobForm, cronExpression: e.target.value })}
              placeholder="0 9 * * *"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Or specific date/time</label>
            <input
              className={inputCls}
              type="datetime-local"
              value={jobForm.runAt}
              onChange={(e) => setJobForm({ ...jobForm, runAt: e.target.value })}
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs font-medium text-gray-600">Keywords (comma-separated)</label>
            <input
              className={inputCls}
              value={jobForm.keyword}
              onChange={(e) => setJobForm({ ...jobForm, keyword: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">
              Countries (your markets — leave blank if set in Find Leads)
            </label>
            <input
              className={inputCls}
              value={jobForm.countries}
              onChange={(e) => setJobForm({ ...jobForm, countries: e.target.value })}
              placeholder="UAE, Germany, USA"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Cities (optional)</label>
            <input
              className={inputCls}
              value={jobForm.cities}
              onChange={(e) => setJobForm({ ...jobForm, cities: e.target.value })}
            />
          </div>
        </div>
        <button
          type="button"
          className={btnPrimary}
          onClick={async () => {
            try {
              const keywords = jobForm.keyword.split(/[,;]+/).map((s) => s.trim()).filter(Boolean)
              const countries = jobForm.countries.split(/[,;]+/).map((s) => s.trim()).filter(Boolean)
              const cities = jobForm.cities.split(/[,;]+/).map((s) => s.trim()).filter(Boolean)
              await saPost("/scheduler", {
                name: jobForm.name || `${jobForm.jobType} job`,
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
              setMessage({ type: "success", text: "Scheduler job created" })
              load()
            } catch (e: any) {
              setMessage({ type: "error", text: e.message })
            }
          }}
        >
          <Plus className="w-4 h-4" /> Add Schedule
        </button>

        {jobs.length === 0 ? (
          <EmptyState title="No scheduled jobs" />
        ) : (
          <table className="w-full text-sm mt-2">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="py-2 font-medium">Name</th>
                <th className="py-2 font-medium">Type</th>
                <th className="py-2 font-medium">Schedule</th>
                <th className="py-2 font-medium">Last Run</th>
                <th className="py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id} className="border-b border-gray-50">
                  <td className="py-2">{j.name}</td>
                  <td className="py-2 text-xs">{j.jobType}</td>
                  <td className="py-2 text-xs">
                    {j.cronExpression || (j.runAt ? new Date(j.runAt).toLocaleString() : "—")}
                  </td>
                  <td className="py-2 text-xs">
                    {j.lastRunAt ? new Date(j.lastRunAt).toLocaleString() : "Never"}
                  </td>
                  <td className="py-2">
                    <button
                      type="button"
                      className="text-indigo-600 text-xs inline-flex items-center gap-1"
                      onClick={async () => {
                        await saPost("/scheduler", { action: "run_now", id: j.id })
                        setMessage({ type: "success", text: "Job queued" })
                      }}
                    >
                      <Play className="w-3 h-3" /> Run now
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
