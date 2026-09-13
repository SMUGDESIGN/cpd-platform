/* Roles, and what each may do. One column on users. Internal roles have no
   org_id; 'provider' users belong to an organisation and see only its rows.
   The tool's own rules (a moderator with no provider contact, a decision
   signed by the lead) are enforced inside the case file and move here as
   stages become pages. Keep this the single place a role's meaning is
   written down. */
export const ROLES = {
  admin: 'Scheme admin - accounts, organisations, billing, everything',
  assessor: 'Lead assessor - runs cases, signs decisions',
  moderator: 'Second assessor - moderation only, no provider contact',
  coordinator: 'Intake coordinator - Stage 1 completeness and returns',
  provider: 'A provider organisation - applies, follows progress, replies, sees billing and feedback',
};

export const INTERNAL_ROLES = ['admin', 'assessor', 'moderator', 'coordinator'];

export function isAdmin(session) {
  return session?.user?.role === 'admin';
}
export function isInternal(session) {
  return INTERNAL_ROLES.includes(session?.user?.role);
}
export function isProvider(session) {
  return session?.user?.role === 'provider' && Number(session?.user?.orgId) > 0;
}
export function canEditCases(session) {
  return isInternal(session);
}
