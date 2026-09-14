/* Roles, and what each may do. One column on users. Internal roles have no
   org_id; 'provider' users belong to an organisation and see only its rows.
   Keep this the single place a role's meaning is written down.

   superadmin  runs the whole platform and sees everything: every page, every
               case, signs decisions, creates and changes any account
               (including other superadmins and support), settings.
   support     looks after accounts: organisations, provider people, billing,
               feedback sharing. Sees The CPD Team but creates no staff and
               changes no role, access or password there - that is a super
               admin's right only (Paul, 14 Sep 2026). Sees every case
               and runs STAGE 1 of any of them (opening the case, completeness,
               the returns letter, the Stage 1 log, and refining the C-items
               while the framework is settling) but nothing from Stage 2 on:
               the save route refuses a support save that touches anything
               outside Stage 1. Cannot create, change, deactivate or reset a
               superadmin.
   assessor    lead assessor - runs cases, signs decisions.
   moderator   second assessor - Stage 5 only, no provider contact.
   coordinator intake - Stage 1 completeness and returns.
   provider    a provider organisation - applies, follows progress, replies,
               sees billing and feedback. */
export const ROLES = {
  superadmin: 'Super admin - the whole platform, sees everything',
  support: 'Support - accounts, organisations, billing, people',
  assessor: 'Lead assessor - runs cases, signs decisions',
  moderator: 'Second assessor - moderation only, no provider contact',
  coordinator: 'Intake coordinator - Stage 1 completeness and returns',
  provider: 'A provider organisation - applies, follows progress, replies, sees billing and feedback',
};

export const INTERNAL_ROLES = ['superadmin', 'support', 'assessor', 'moderator', 'coordinator'];
export const ADMIN_ROLES = ['superadmin', 'support'];          // may open the admin area
export const PRIVILEGED_ROLES = ['superadmin', 'support'];     // only a superadmin may grant, change or touch these
export const CASE_ROLES = ['superadmin', 'assessor', 'moderator', 'coordinator']; // may save any stage
export const STAGE1_ROLES = [...CASE_ROLES, 'support'];                              // may open a case and save Stage 1

export function isSuperAdmin(session) { return session?.user?.role === 'superadmin'; }
export function isAdmin(session) { return ADMIN_ROLES.includes(session?.user?.role); }
export function isInternal(session) { return INTERNAL_ROLES.includes(session?.user?.role); }
export function isProvider(session) { return session?.user?.role === 'provider' && Number(session?.user?.orgId) > 0; }
export function canEditCases(session) { return CASE_ROLES.includes(session?.user?.role); }
export function canEditStage1(session) { return STAGE1_ROLES.includes(session?.user?.role); }
/* 'all' | 'stage1' | null - how much of a case this session may change. */
export function caseScope(session) { return canEditCases(session) ? 'all' : (canEditStage1(session) ? 'stage1' : null); }

/* May `actor` create an account with `role`, or change/deactivate/reset an
   account that currently holds `targetRole`? Staff accounts are a super
   admin's alone; support's reach is provider people. */
export function canGrantRole(session, role) {
  if (isSuperAdmin(session)) return INTERNAL_ROLES.includes(role) || role === 'provider';
  if (session?.user?.role === 'support') return role === 'provider';
  return false;
}
export function canTouchAccount(session, targetRole) {
  if (isSuperAdmin(session)) return true;
  if (session?.user?.role === 'support') return targetRole === 'provider';
  return false;
}
/* Contact details (a phone number) are not permissions: support may keep
   them current for anyone but a super admin. */
export function canEditContact(session, targetRole) {
  if (isSuperAdmin(session)) return true;
  if (session?.user?.role === 'support') return targetRole !== 'superadmin';
  return false;
}
