'use client';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import AppLayout from '../AppLayout';

/* The assessor tool, full-height inside the shell. Batch B replaces the
   placeholder with the tool itself (public/tool/dashboard.html, saving through
   /api/entries rather than the browser). */
function ToolFrame() {
  const params = useSearchParams();
  const entry = params.get('entry');
  return (
    <div className="panel">
      <h1>Assessment tool</h1>
      <p>Arrives in the next batch: the eight-stage assessor tool, saving every case to this database{entry ? ` (opening ${entry})` : ''}.</p>
    </div>
  );
}

export default function ToolPage() {
  return (
    <AppLayout>
      <Suspense fallback={null}><ToolFrame /></Suspense>
    </AppLayout>
  );
}
