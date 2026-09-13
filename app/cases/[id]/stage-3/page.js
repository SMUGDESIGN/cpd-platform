'use client';
import StagePage from '../../StagePage';

/* Stage 3 - live verification: the indicators that can only be judged by
   doing - joining as a learner, following the help and complaint routes,
   watching delivery. Same rows and notices as Stage 2; unlocks with it. */
export default function Stage3() {
  return <StagePage stage={3} title="Live verification" notesKey="stage3"
    notesPlaceholder="What was tested for real, when, from which account; who was observed delivering; what the help route did…"
    intro="The indicators that can only be judged by doing: access the activity as a learner would, use the help and reporting routes, watch delivery where there is any. Delivery only - never the subject matter (A5). These unlock with Stage 2 and can run alongside it; live observation cannot wait for the desk to finish." />;
}
