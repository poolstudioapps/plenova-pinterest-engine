/**
 * Operator identity shown on the legal pages.
 *
 * Kept in one place because platform reviewers cross-check these against the
 * developer account, and a mismatch is a common rejection reason.
 */
export const LEGAL = {
  toolName: "Plenova Tool",
  operator: process.env.LEGAL_OPERATOR ?? "L'Atelier UGC",
  contactEmail: process.env.LEGAL_CONTACT_EMAIL ?? "contact@latelierugc.com",
  updated: "10 September 2026",
} as const;
