export type BankExportFormat = 'csv' | 'sepa' | 'aba';

export interface BankExportPayee {
  id: number;
  name: string;
  amount: number;
  currency: string;
  iban?: string | null;
  bic?: string | null;
  accountNumber?: string | null;
  sortCode?: string | null;
  bankName?: string | null;
  reference: string;
}

export interface BankExportCompany {
  name: string;
  iban?: string | null;
  bic?: string | null;
  accountNumber?: string | null;
  sortCode?: string | null;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function padLeft(s: string, len: number, ch = '0'): string {
  return s.length >= len ? s.slice(0, len) : ch.repeat(len - s.length) + s;
}

function formatAmountSepa(amount: number): string {
  return amount.toFixed(2);
}

export function buildCsvExport(payees: BankExportPayee[]): string {
  const header = 'Name,Amount,Currency,Account,SortCode,IBAN,BIC,Reference';
  const rows = payees.map((p) => {
    const cols = [
      `"${(p.name || '').replace(/"/g, '""')}"`,
      p.amount.toFixed(2),
      p.currency,
      p.accountNumber ?? '',
      p.sortCode ?? '',
      p.iban ?? '',
      p.bic ?? '',
      `"${p.reference.replace(/"/g, '""')}"`,
    ];
    return cols.join(',');
  });
  return [header, ...rows].join('\n');
}

/** Minimal SEPA Credit Transfer pain.001.001.03 XML (batch). */
export function buildSepaXml(company: BankExportCompany, payees: BankExportPayee[]): string {
  const msgId = `PAY${Date.now()}`;
  const creDtTm = new Date().toISOString();
  const total = payees.reduce((s, p) => s + p.amount, 0).toFixed(2);
  const debtorIban = (company.iban || '').replace(/\s/g, '');
  const debtorBic = company.bic || 'NOTPROVIDED';
  const txBlocks = payees
    .map((p, i) => {
      const iban = (p.iban || p.accountNumber || '').replace(/\s/g, '');
      const bic = p.bic || 'NOTPROVIDED';
      return `
    <CdtTrfTxInf>
      <PmtId><EndToEndId>${escapeXml(p.reference || `TX${i + 1}`)}</EndToEndId></PmtId>
      <Amt><InstdAmt Ccy="${escapeXml(p.currency)}">${formatAmountSepa(p.amount)}</InstdAmt></Amt>
      <CdtrAgt><FinInstnId><BIC>${escapeXml(bic)}</BIC></FinInstnId></CdtrAgt>
      <Cdtr><Nm>${escapeXml(p.name)}</Nm></Cdtr>
      <CdtrAcct><Id><IBAN>${escapeXml(iban)}</IBAN></Id></CdtrAcct>
      <RmtInf><Ustrd>${escapeXml(p.reference)}</Ustrd></RmtInf>
    </CdtTrfTxInf>`;
    })
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03">
  <CstmrCdtTrfInitn>
    <GrpHdr>
      <MsgId>${escapeXml(msgId)}</MsgId>
      <CreDtTm>${creDtTm}</CreDtTm>
      <NbOfTxs>${payees.length}</NbOfTxs>
      <CtrlSum>${total}</CtrlSum>
      <InitgPty><Nm>${escapeXml(company.name)}</Nm></InitgPty>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>${escapeXml(msgId)}-1</PmtInfId>
      <PmtMtd>TRF</PmtMtd>
      <NbOfTxs>${payees.length}</NbOfTxs>
      <CtrlSum>${total}</CtrlSum>
      <PmtTpInf><SvcLvl><Cd>SEPA</Cd></SvcLvl></PmtTpInf>
      <ReqdExctnDt>${new Date().toISOString().slice(0, 10)}</ReqdExctnDt>
      <Dbtr><Nm>${escapeXml(company.name)}</Nm></Dbtr>
      <DbtrAcct><Id><IBAN>${escapeXml(debtorIban)}</IBAN></Id></DbtrAcct>
      <DbtrAgt><FinInstnId><BIC>${escapeXml(debtorBic)}</BIC></FinInstnId></DbtrAgt>
      <ChrgBr>SLEV</ChrgBr>${txBlocks}
    </PmtInf>
  </CstmrCdtTrfInitn>
</Document>`;
}

/** Simplified ABA direct entry file (Australia-style fixed-width batch). */
export function buildAbaExport(company: BankExportCompany, payees: BankExportPayee[]): string {
  const bsb = (company.sortCode || '000000').replace(/\D/g, '').slice(0, 6).padStart(6, '0');
  const acc = (company.accountNumber || '00000000').replace(/\D/g, '').slice(0, 9).padStart(9, '0');
  const totalCents = payees.reduce((s, p) => s + Math.round(p.amount * 100), 0);
  const lines: string[] = [];

  // Type 0 — descriptive record
  lines.push(
    `0${padLeft('', 17)}01${bsb}${acc.padEnd(9).slice(0, 9)}${' '.repeat(12)}${company.name.slice(0, 26).padEnd(26)}${padLeft(String(payees.length), 6)}${padLeft(String(totalCents), 10)}${' '.repeat(24)}`,
  );

  for (const p of payees) {
    const payBsb = (p.sortCode || '000000').replace(/\D/g, '').slice(0, 6).padStart(6, '0');
    const payAcc = (p.accountNumber || '00000000').replace(/\D/g, '').slice(0, 9).padStart(9, '0');
    const cents = padLeft(String(Math.round(p.amount * 100)), 10);
    const name = p.name.slice(0, 32).padEnd(32);
    const ref = p.reference.slice(0, 18).padEnd(18);
    lines.push(`1${payBsb}${payAcc}${' '}${cents}${name}${ref}00000000${bsb}${acc.padEnd(9).slice(0, 9)}${' '.repeat(16)}`);
  }

  // Type 7 — file total
  const netTotal = padLeft(String(totalCents), 10);
  lines.push(`7999-999${' '.repeat(12)}${netTotal}${netTotal}${' '.repeat(24)}${padLeft(String(payees.length), 6)}${' '.repeat(40)}`);

  return lines.join('\n');
}

export function buildBankExport(
  format: BankExportFormat,
  company: BankExportCompany,
  payees: BankExportPayee[],
): { content: string; mimeType: string; extension: string } {
  if (format === 'sepa') {
    return { content: buildSepaXml(company, payees), mimeType: 'application/xml', extension: 'xml' };
  }
  if (format === 'aba') {
    return { content: buildAbaExport(company, payees), mimeType: 'text/plain', extension: 'aba' };
  }
  return { content: buildCsvExport(payees), mimeType: 'text/csv', extension: 'csv' };
}
