// Places where SPEC.md does not pin a wire detail. Code that reaches one of these
// throws instead of guessing; each id matches a GitHub issue labelled spec-question.
// Clean-room rule: fill these only from spec revisions or our own captures.

export const SPEC_GAPS = {
  "Q-001": "Field numbers of ConfigVersion subfields (Year/Month/Day/V1/V2) inside AuthMessage f7",
  "Q-002": "Field number carrying the SPKI public key inside RegisterPhoneRelay f4 key-data submessage",
  "Q-003": "Which embedded API key is sent as X-Goog-Api-Key for Pairing/Messaging in QR mode",
  "Q-004": "Location of the route/type=14 field and its payload bytes within a ReceiveMessages stream element, and whether the payload is binary protobuf or JSPB",
} as const;

export type SpecGapId = keyof typeof SPEC_GAPS;

export class SpecGapError extends Error {
  constructor(readonly gap: SpecGapId) {
    super(`Spec gap ${gap}: ${SPEC_GAPS[gap]} (GitHub issue #${Number(gap.slice(2))}, label spec-question)`);
    this.name = "SpecGapError";
  }
}
