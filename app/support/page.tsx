"use client";

import { useState } from "react";
import Image from "next/image";

export default function SupportPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessMessage(null);
    setErrorMessage(null);

    const trimmedEmail = email.trim();
    const trimmedSubject = subject.trim();
    const trimmedMessage = message.trim();

    if (!trimmedEmail || !trimmedSubject || !trimmedMessage) {
      setErrorMessage("Email, subject, and message are required.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/support-tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: trimmedEmail,
          name: name.trim() || undefined,
          subject: trimmedSubject,
          message: trimmedMessage,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to submit support request.");
      }

      setSuccessMessage(
        "Thank you for contacting TidyFlow. Your support request has been received and we will get back to you as soon as possible."
      );
      setName("");
      setEmail("");
      setSubject("");
      setMessage("");
    } catch (err: any) {
      setErrorMessage(err.message || "Something went wrong while submitting your request.");
    } finally {
      setLoading(false);
    }
  };

  const fieldCls =
    "block w-full pl-10 pr-3 py-2.5 border border-slate-200 rounded-lg text-navy-950 placeholder-slate-400 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 transition-all sm:text-sm";

  return (
    <main className="min-h-screen bg-[#F7F4EF] flex flex-col items-center justify-center px-4 py-12 font-sans text-slate-900">
      <div className="mb-8 text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#0B1F33] shadow-lg mb-4">
          <Image
            src="/assets/logot-transparent.png"
            alt="TidyFlow"
            width={36}
            height={36}
            className="object-contain"
          />
        </div>
        <h2 className="text-3xl font-bold tracking-tight text-[#0B1F33]">TidyFlow</h2>
        <p className="text-sm text-slate-500 mt-1">Help & Support Center</p>
      </div>

      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl border border-slate-200/80 overflow-hidden">
        <div className="h-1.5 w-full bg-gradient-to-r from-[#0B1F33] via-amber-500 to-amber-400" />

        <div className="p-6 sm:p-8">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-[#0B1F33] mb-2">Contact Support</h1>
            <p className="text-slate-600 text-sm leading-relaxed">
              Having trouble logging in or experiencing issues with the app? Fill out the form below
              to open a ticket with our team. No login is required.
            </p>
          </div>

          <div className="bg-amber-50 border border-amber-100 rounded-xl p-5 mb-8">
            <h3 className="text-sm font-bold text-amber-950 mb-2">What happens next?</h3>
            <ul className="space-y-2 text-sm text-amber-900/90">
              <li>A support ticket is created automatically.</li>
              <li>We reply to the email address you provide below.</li>
              <li>Include device model, app version, and screenshots when possible.</li>
            </ul>
          </div>

          {successMessage && (
            <div className="mb-6 bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-sm text-emerald-800 font-medium">
              {successMessage}
            </div>
          )}
          {errorMessage && (
            <div className="mb-6 bg-rose-50 border border-rose-200 rounded-lg p-4 text-sm text-rose-800 font-medium">
              {errorMessage}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Your Name <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Jane Doe"
                    className={fieldCls}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Email Address <span className="text-rose-500">*</span>
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  required
                  className={fieldCls}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Subject <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="I can't access my account..."
                required
                className={fieldCls}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                How can we help? <span className="text-rose-500">*</span>
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={5}
                required
                placeholder="Describe your issue in detail…"
                className="block w-full px-3 py-3 border border-slate-200 rounded-lg text-navy-950 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 sm:text-sm resize-y min-h-[120px]"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full inline-flex items-center justify-center rounded-lg bg-[#0B1F33] px-6 py-3 text-sm font-semibold text-amber-300 shadow-sm hover:bg-[#132a42] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? "Submitting Ticket..." : "Submit Support Request"}
            </button>
          </form>
        </div>

        <div className="bg-slate-50 px-6 py-4 border-t border-slate-100 flex flex-col items-center gap-2">
          <p className="text-xs text-slate-400">
            &copy; {new Date().getFullYear()} TidyFlow. All rights reserved.
          </p>
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 shadow-sm">
            <Image
              src="/assets/logot-transparent.png"
              alt=""
              width={16}
              height={16}
              className="object-contain opacity-90"
            />
            <span className="text-[11px] font-semibold tracking-wide text-[#0B1F33]">
              Powered By TidyFlow
            </span>
          </div>
        </div>
      </div>
    </main>
  );
}
