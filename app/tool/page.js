'use client';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import AppLayout from '../AppLayout';

/* The assessor tool, framed full-height inside the shell.
   public/assessor/dashboard.html is the eight-stage tool from the website
   repo with its storage layer swapped: it boots from /api/store and saves
   every case through /api/entries with the version it read (see the
   "platform storage" block in that file). It sits behind the same login as
   everything else - middleware.js covers /assessor/ like any other path -
   and the frame is same-origin, which X-Frame-Options SAMEORIGIN allows.
   Stages move out of the frame and into pages one at a time from here. */
function ToolFrame() {
  const params = useSearchParams();
  const entry = params.get('entry');
  const src = '/assessor/dashboard.html' + (entry ? '?entry=' + encodeURIComponent(entry) : '');
  return <iframe className="tool-frame" src={src} title="Assessment tool" />;
}

export default function ToolPage() {
  return (
    <AppLayout wide>
      <Suspense fallback={null}><ToolFrame /></Suspense>
    </AppLayout>
  );
}
