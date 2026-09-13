/* Roles, and what each may do. One column on users for now; the tool's own
   rules (a moderator with no provider contact, a decision signed by the lead)
   are enforced inside the case file and will move here as stages become
   pages. Keep this the single place a role's meaning is written down. */
export const ROLES = {
  admin: 'Scheme admin - accounts, settings, everything',
  assessor: 'Lead assessor - runs cases, signs decisions',
  moderator: 'Second assessor - moderation only, no provider contact',
  coordinator: 'Intake coordinator - Stage 1 completeness and returns',
};

export function isAdmin(session) {
  return session?.user?.role === 'admin';
}

export function canEditCases(session) {
  return ['admin', 'assessor', 'moderator', 'coordinator'].includes(session?.user?.role);
}
