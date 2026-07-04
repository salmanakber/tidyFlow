import type { Metadata } from 'next';
import LegalPageLayout from '@/components/LegalPageLayout';

export const metadata: Metadata = {
  title: 'Privacy Policy | TidyFlow',
  description:
    'How TidyFlow collects, uses, and protects personal and business data for cleaning companies, staff, and clients.',
  openGraph: {
    title: 'Privacy Policy | TidyFlow',
    description:
      'How TidyFlow collects, uses, and protects personal and business data for cleaning companies, staff, and clients.',
    url: 'https://api.tidyflowapp.com/privacy',
  },
};

const LAST_UPDATED = '4 July 2026';

export default function PrivacyPolicyPage() {
  return (
    <LegalPageLayout title="Privacy Policy" lastUpdated={LAST_UPDATED}>
      <p>
        This Privacy Policy explains how TidyFlow (&quot;TidyFlow&quot;, &quot;we&quot;, &quot;us&quot;, or
        &quot;our&quot;) collects, uses, stores, and shares information when you use our mobile applications,
        web admin tools, APIs, and related services (collectively, the &quot;Service&quot;).
      </p>
      <p>
        By using the Service, you agree to this Privacy Policy. If you do not agree, please do not use the
        Service.
      </p>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-900">1. Who we are</h2>
        <p>
          TidyFlow is a cloud-based operations platform for cleaning companies. It helps owners, managers,
          and cleaners schedule work, verify jobs with GPS and photos, manage payroll-related records, and
          communicate with clients.
        </p>
        <p>
          For privacy questions, contact us at{' '}
          <a href="mailto:privacy@tidyflowapp.com" className="font-medium text-teal-700 hover:underline">
            privacy@tidyflowapp.com
          </a>{' '}
          or{' '}
          <a href="mailto:support@tidyflowapp.com" className="font-medium text-teal-700 hover:underline">
            support@tidyflowapp.com
          </a>
          .
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-900">2. Information we collect</h2>
        <p>We may collect the following categories of information:</p>

        <h3 className="text-base font-semibold text-slate-800">2.1 Account and profile information</h3>
        <ul className="list-disc space-y-1 pl-5">
          <li>Name, email address, phone number, and password or authentication credentials</li>
          <li>Role (for example owner, manager, cleaner, or client portal user)</li>
          <li>Company name, business details, and subscription or billing profile</li>
          <li>Profile photo and language preferences</li>
        </ul>

        <h3 className="text-base font-semibold text-slate-800">2.2 Operational and business data</h3>
        <ul className="list-disc space-y-1 pl-5">
          <li>Properties, addresses, tasks, schedules, checklists, and job notes</li>
          <li>Assignments, time logs, payroll-related rules, expenses, and invoices</li>
          <li>Client feedback, reviews, support tickets, and announcements</li>
          <li>Files and photos uploaded as proof of work or job documentation</li>
        </ul>

        <h3 className="text-base font-semibold text-slate-800">2.3 Location information</h3>
        <p>
          When a cleaner or staff member starts or works on an active job and grants permission, we may
          collect precise location data (GPS) to verify on-site presence, build a job timeline, and support
          features such as GPS hours, tracking banners, and proof maps. Location collection is intended for
          active job workflows and related operational verification, not continuous personal tracking outside
          those purposes.
        </p>

        <h3 className="text-base font-semibold text-slate-800">2.4 Device and usage information</h3>
        <ul className="list-disc space-y-1 pl-5">
          <li>Device type, operating system, app version, and push notification tokens</li>
          <li>Log data such as IP address, access times, and error reports</li>
          <li>In-app actions needed to operate and improve the Service</li>
        </ul>

        <h3 className="text-base font-semibold text-slate-800">2.5 Payment information</h3>
        <p>
          Subscription payments are processed by Stripe. We do not store full payment card numbers on our
          servers. Stripe may collect billing details according to its own privacy policy.
        </p>

        <h3 className="text-base font-semibold text-slate-800">2.6 Integrations</h3>
        <p>
          If you connect third-party services (for example Google Sheets, Google Maps, email providers, or
          cloud storage), we process the data needed to provide those integrations, subject to your
          configuration and the third party&apos;s terms.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-900">3. How we use information</h2>
        <p>We use information to:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Provide, operate, and maintain the Service</li>
          <li>Authenticate users and manage company accounts and roles</li>
          <li>Schedule jobs, assign staff, and track work progress</li>
          <li>Verify on-site work using GPS, photos, and related proof features</li>
          <li>Support offline sync, notifications, chat, and operational alerts (including SOS where enabled)</li>
          <li>Process subscriptions, invoices, and related billing events</li>
          <li>Provide customer support and respond to account or deletion requests</li>
          <li>Improve reliability, security, and product features, including AI-assisted suggestions where enabled</li>
          <li>Comply with legal obligations and enforce our Terms of Service</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-900">4. Legal bases (where applicable)</h2>
        <p>
          If you are in the UK, EEA, or another region that requires a legal basis for processing, we rely on
          one or more of the following: performance of a contract, legitimate interests (such as securing and
          improving the Service), consent (for example certain device permissions), and legal compliance.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-900">5. How we share information</h2>
        <p>We may share information with:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Your organisation:</strong> owners and managers within your company can access operational
            data for staff and properties according to role permissions
          </li>
          <li>
            <strong>Clients and recipients you choose:</strong> for example share links, review pages, invoices,
            or job proof you send
          </li>
          <li>
            <strong>Service providers:</strong> hosting, databases, email delivery, maps, analytics, payment
            processing, and similar infrastructure providers who process data on our behalf
          </li>
          <li>
            <strong>Legal and safety:</strong> when required by law, or to protect rights, safety, and the
            integrity of the Service
          </li>
        </ul>
        <p>We do not sell your personal information.</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-900">6. Data retention</h2>
        <p>
          We retain information for as long as needed to provide the Service, maintain business records,
          resolve disputes, and meet legal obligations. When you request account deletion, we process the
          request according to our deletion workflow and applicable law. Some information may remain in
          backups or logs for a limited period.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-900">7. Security</h2>
        <p>
          We use administrative, technical, and organisational measures designed to protect information,
          including access controls and encrypted transport where appropriate. No method of transmission or
          storage is completely secure, and we cannot guarantee absolute security.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-900">8. Your rights and choices</h2>
        <p>Depending on your location, you may have rights to:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Access, correct, or delete personal information</li>
          <li>Object to or restrict certain processing</li>
          <li>Withdraw consent where processing is based on consent</li>
          <li>Request a copy of certain data in a portable format</li>
        </ul>
        <p>
          You can update profile details in the app or admin tools, manage device permissions (location,
          notifications, camera) in your device settings, and request account deletion through the in-app or
          web account-deletion flow. To exercise other rights, email{' '}
          <a href="mailto:privacy@tidyflowapp.com" className="font-medium text-teal-700 hover:underline">
            privacy@tidyflowapp.com
          </a>
          .
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-900">9. Children</h2>
        <p>
          The Service is designed for business use and is not directed to children under 16. We do not
          knowingly collect personal information from children.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-900">10. International transfers</h2>
        <p>
          Your information may be processed in countries other than where you live. Where required, we take
          steps designed to ensure appropriate safeguards for such transfers.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-900">11. Changes to this policy</h2>
        <p>
          We may update this Privacy Policy from time to time. We will post the updated version on this page
          and revise the &quot;Last updated&quot; date. Continued use of the Service after changes become
          effective constitutes acceptance of the updated policy.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-900">12. Contact</h2>
        <p>
          TidyFlow privacy enquiries:{' '}
          <a href="mailto:privacy@tidyflowapp.com" className="font-medium text-teal-700 hover:underline">
            privacy@tidyflowapp.com
          </a>
          <br />
          General support:{' '}
          <a href="mailto:support@tidyflowapp.com" className="font-medium text-teal-700 hover:underline">
            support@tidyflowapp.com
          </a>
          <br />
          Website: <span className="font-medium text-slate-800">https://tidyflowapp.com</span>
        </p>
      </section>
    </LegalPageLayout>
  );
}
