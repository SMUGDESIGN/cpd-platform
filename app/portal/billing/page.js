'use client';
import { useEffect, useState } from 'react';
import AppLayout from '../../AppLayout';
import { gbp, longDay } from '../../money';

export default function Billing() {
  const [d, setD] = useState(null);
  useEffect(() => { fetch('/api/portal/billing').then((r) => r.json()).then(setD); }, []);
  return (
    <AppLayout>
      <h1>Billing</h1>
      {d && (
        <>
          <div className="panel"><p><b>{gbp(d.outstandingPence)} outstanding.</b> Pay by bank transfer quoting the invoice number; we mark it paid when it arrives. Fees are payable regardless of outcome - that separation is what keeps every decision clean.</p></div>
          <div className="panel panel--table">
            <table className="table">
              <thead><tr><th>Invoice</th><th>For</th><th>Case</th><th>Issued</th><th>Due</th><th>Amount</th><th>Status</th></tr></thead>
              <tbody>
                {!d.invoices.length && <tr><td colSpan={7} className="muted">No invoices yet.</td></tr>}
                {d.invoices.map((i) => (
                  <tr key={i.id}>
                    <td className="ref">{i.number}</td><td>{i.description}</td><td>{i.case_ref || '—'}</td>
                    <td className="nowrap">{longDay(i.issued_at)}</td><td className="nowrap">{i.due_at ? longDay(i.due_at) : '—'}</td>
                    <td className="nowrap">{gbp(i.amount_pence)}</td>
                    <td><span className={'status ' + (i.status === 'paid' ? 'ok' : (i.status === 'void' ? 'idle' : (i.due_at && i.due_at < new Date().toISOString().slice(0, 10) ? 'bad' : 'warn')))}>{i.status === 'paid' ? 'Paid ' + longDay(i.paid_at) : (i.status === 'void' ? 'Void' : 'Awaiting payment')}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </AppLayout>
  );
}
