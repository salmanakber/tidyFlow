import { redirect } from 'next/navigation';

/** Marketing hub — currently routes to AI Sales Agent. */
export default function MarketingIndexPage() {
  redirect('/admin/marketing/ai-sales-agent');
}
