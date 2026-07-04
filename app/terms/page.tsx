import type { Metadata } from 'next';
import LegalPageLayout from '@/components/LegalPageLayout';

export const metadata: Metadata = {
  title: 'Terms of Service | TidyFlow',
  description:
    'Terms and conditions for using the TidyFlow cleaning operations platform, mobile apps, and related services.',
  openGraph: {
    title: 'Terms of Service | TidyFlow',
    description:
      'Terms and conditions for using the TidyFlow cleaning operations platform, mobile apps, and related services.',
    url: 'https://api.tidyflowapp.com/terms',
  },
};

const LAST_UPDATED = '4 July 2026';

export default function TermsOfServicePage() {
  return (
    <LegalPageLayout title="Terms of Service" lastUpdated={LAST_UPDATED}>
      <p>
        These Terms of Service (&quot;Terms&quot;) govern your access to and use of TidyFlow&apos;s mobile
        applications, web admin tools, APIs, websites, and related services (collectively, the
        &quot;Service&quot;). By creating an account, accessing, or using the Service, you agree to these
        Terms.
      </p>
      <p>
        If you are using the Service on behalf of a company or other organisation, you represent that you
        have authority to bind that organisation, and &quot;you&quot; includes that organisation.
      </p>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-900">1. The Service</h2>
        <p>
          TidyFlow provides software tools for cleaning and property operations, including scheduling,
          staff assignment, GPS and photo verification, payroll-related records, client communication,
          invoicing support, integrations, and optional AI-assisted features. Features available to you
          depend on your plan, role, and configuration.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-900">2. Accounts and eligibility</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>You must provide accurate account information and keep it up to date.</li>
          <li>You are responsible for safeguarding login credentials and for activity under your account.</li>
          <li>You must promptly notify us of any unauthorised use of your account.</li>
          <li>The Service is intended for business and professional use by adults.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-900">3. Company administrators and staff</h2>
        <p>
          If you are an owner or administrator, you are responsible for users you invite, the roles you
          assign, the data your organisation uploads, and ensuring your staff and clients are informed about
          how the Service is used (including location and photo features where applicable).
        </p>
        <p>
          Staff users must use the Service only for authorised work purposes and in accordance with their
          employer&apos;s policies and applicable law.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-900">4. Acceptable use</h2>
        <p>You agree not to:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Use the Service for unlawful, harmful, fraudulent, or abusive purposes</li>
          <li>Attempt to gain unauthorised access to systems, accounts, or data</li>
          <li>Interfere with or disrupt the Service, including through malware or excessive automated requests</li>
          <li>Misrepresent your identity, company affiliation, or job verification data</li>
          <li>Upload content you do not have rights to use, or that infringes others&apos; rights</li>
          <li>Reverse engineer, scrape, or resell the Service except as permitted by law or written agreement</li>
          <li>Use location, photo, or tracking features to harass individuals or violate privacy laws</li>
        </ul>
        <p>We may suspend or terminate access for violations of these Terms.</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-900">5. Location, photos, and operational data</h2>
        <p>
          Certain features rely on device permissions and operational data, including GPS during active jobs,
          camera or photo uploads for proof of work, notifications, and offline sync. You are responsible for
          obtaining any consents and providing any notices required for your workforce and clients.
        </p>
        <p>
          Location and proof features are provided to support operational verification. They are not a
          guarantee of employee conduct, job quality, or legal compliance.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-900">6. Subscriptions, trials, and billing</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Paid plans, property limits, and feature access are described in your plan or checkout flow.</li>
          <li>Payments are processed by Stripe or another payment provider we designate.</li>
          <li>Fees are generally non-refundable except where required by law or expressly stated by us.</li>
          <li>We may change pricing or plan features with reasonable notice for renewals or new purchases.</li>
          <li>Failure to pay may result in suspension or limitation of the Service.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-900">7. Your content</h2>
        <p>
          You retain ownership of content you submit to the Service (&quot;Customer Content&quot;), including
          property details, tasks, photos, notes, and client information. You grant TidyFlow a limited
          licence to host, process, transmit, display, and otherwise use Customer Content solely to provide
          and improve the Service.
        </p>
        <p>
          You represent that you have all rights necessary to submit Customer Content and that doing so does
          not violate law or third-party rights.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-900">8. Our intellectual property</h2>
        <p>
          The Service, including software, branding, design, and documentation, is owned by TidyFlow or its
          licensors and is protected by intellectual property laws. These Terms do not grant you any rights
          to our trademarks or source code except the limited right to use the Service as permitted.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-900">9. Third-party services</h2>
        <p>
          The Service may integrate with third-party products such as Google Sheets, Google Maps, Stripe,
          email providers, and app stores. Your use of those services is subject to their terms and privacy
          policies. We are not responsible for third-party services we do not control.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-900">10. AI features</h2>
        <p>
          Optional AI-assisted features may provide suggestions (for example assignments, checklists, or
          photo-related insights). AI outputs can be incomplete or incorrect. You remain responsible for
          reviewing and deciding whether to use any suggestion.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-900">11. Availability and changes</h2>
        <p>
          We aim to keep the Service available and reliable, but we do not guarantee uninterrupted or
          error-free operation. We may modify, suspend, or discontinue features, including for maintenance,
          security, or legal reasons.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-900">12. Disclaimers</h2>
        <p>
          THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; WITHOUT WARRANTIES OF ANY
          KIND, WHETHER EXPRESS, IMPLIED, OR STATUTORY, INCLUDING IMPLIED WARRANTIES OF MERCHANTABILITY,
          FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT, TO THE MAXIMUM EXTENT PERMITTED BY LAW.
        </p>
        <p>
          TidyFlow does not warrant that the Service will meet your specific business requirements or that
          GPS, photos, or other verification tools will be accurate in all conditions.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-900">13. Limitation of liability</h2>
        <p>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, TIDYFLOW AND ITS AFFILIATES, OFFICERS, EMPLOYEES, AND
          SUPPLIERS WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE
          DAMAGES, OR ANY LOSS OF PROFITS, REVENUE, DATA, OR BUSINESS OPPORTUNITY, ARISING OUT OF OR RELATED
          TO YOUR USE OF THE SERVICE.
        </p>
        <p>
          OUR TOTAL LIABILITY FOR ANY CLAIM ARISING OUT OF OR RELATING TO THE SERVICE WILL NOT EXCEED THE
          AMOUNTS YOU PAID TO TIDYFLOW FOR THE SERVICE IN THE TWELVE (12) MONTHS BEFORE THE EVENT GIVING RISE
          TO THE CLAIM.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-900">14. Indemnity</h2>
        <p>
          You agree to defend, indemnify, and hold harmless TidyFlow from and against claims, damages,
          losses, and expenses (including reasonable legal fees) arising from your Customer Content, your use
          of the Service, or your violation of these Terms or applicable law.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-900">15. Termination</h2>
        <p>
          You may stop using the Service at any time and may request account deletion through the available
          deletion flow. We may suspend or terminate access if you breach these Terms, fail to pay fees, or
          if continued access would create risk or legal exposure. Provisions that by their nature should
          survive termination will survive.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-900">16. Privacy</h2>
        <p>
          Our collection and use of personal information is described in our{' '}
          <a href="/privacy" className="font-medium text-teal-700 hover:underline">
            Privacy Policy
          </a>
          , which forms part of your agreement with us.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-900">17. Governing law</h2>
        <p>
          These Terms are governed by the laws of England and Wales, without regard to conflict-of-law
          principles, unless mandatory local law provides otherwise. Courts in England and Wales will have
          exclusive jurisdiction, except where applicable consumer or employment law requires otherwise.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-900">18. Changes to these Terms</h2>
        <p>
          We may update these Terms from time to time. We will post the updated Terms on this page and update
          the &quot;Last updated&quot; date. If changes are material, we may provide additional notice. Your
          continued use of the Service after the effective date constitutes acceptance of the updated Terms.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-900">19. Contact</h2>
        <p>
          Questions about these Terms:{' '}
          <a href="mailto:support@tidyflowapp.com" className="font-medium text-teal-700 hover:underline">
            support@tidyflowapp.com
          </a>
          <br />
          Privacy enquiries:{' '}
          <a href="mailto:privacy@tidyflowapp.com" className="font-medium text-teal-700 hover:underline">
            privacy@tidyflowapp.com
          </a>
          <br />
          Website: <span className="font-medium text-slate-800">https://tidyflowapp.com</span>
        </p>
      </section>
    </LegalPageLayout>
  );
}
