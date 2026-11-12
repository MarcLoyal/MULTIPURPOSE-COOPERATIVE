import { CivilStatus, MemberStatus } from "./types";

// Bilingual (Tagalog first) plain-language labels for IWMPC's
// non-digital, older staff and board — humanizeEnum's English-only
// "Active"/"Inactive" stays as-is for every other use of MemberStatus
// in the app; these are used only where the member profile explicitly
// asks for plain bilingual wording, not a blanket Badge.tsx change.
export const MEMBER_STATUS_LABELS: Record<MemberStatus, string> = {
  active: "Aktibo (Active)",
  inactive: "Hindi Aktibo (Inactive)",
  resigned: "Nagbitiw (Resigned)",
  deceased: "Yumao (Deceased)",
  terminated: "Tinanggal (Terminated)",
};

export const CIVIL_STATUS_LABELS: Record<CivilStatus, string> = {
  single: "Walang asawa (Single)",
  married: "May asawa (Married)",
  widowed: "Balo (Widowed)",
  separated: "Hiwalay (Separated)",
};

export const CIVIL_STATUS_OPTIONS: CivilStatus[] = ["single", "married", "widowed", "separated"];
