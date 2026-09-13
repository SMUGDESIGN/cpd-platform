'use client';
import StagePage from '../../StagePage';

/* Stage 2 - desk review and scoring: the desk indicators, judged against the
   submitted material. Locked until Stage 1 passes. A gate rated Not met opens
   the provider notice at once - "flagged early, never ambushed at decision". */
export default function Stage2() {
  return <StagePage stage={2} title="Desk review & scoring"
    intro="Every desk indicator, judged against the submitted material with cited evidence. Gates are Met or Not met - no score can rescue a failed gate, so a Not met opens the provider notice now. Scored rows carry two points: Met 2, Partially met 1, N/A excluded from the available points." />;
}
