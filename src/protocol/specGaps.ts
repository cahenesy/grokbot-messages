// Places where SPEC.md does not pin a wire detail. Code that reaches one of these
// throws instead of guessing; each id matches a GitHub issue labelled spec-question.
// Clean-room rule: fill these only from spec revisions or our own captures.
//
// Issue map without a runtime entry here:
// - Q-001 (#1), Q-002 (#2): filled from the public bundle (DEVLOG 2026-10-18), pending spec-team review.
// - Q-005 (#5): browser-details f5/f6 meaning UNVERIFIED (A-005); encoder sends the both-flags-off defaults [B@1085900].
// - Q-006 (#6): process ruling, resolved — binding clean-room controls, see DEVLOG.md.
// - Q-007 (#7): process ruling, resolved — Google-account pairing primary; QR never in tool output.

export const SPEC_GAPS = {
  "Q-003": "X-Goog-Api-Key value: comes from page-config constant A16fYe [B@811680], read at runtime; not configured",
  "Q-004": "Location of the route/type=14 field and its payload bytes within a ReceiveMessages stream element, and whether the payload is binary protobuf or JSPB",
  "Q-008": "SendMessage Message.f12 envelope encoding, qN/deadline per action, and the inbound path to the response envelope and relay message id",
  "Q-009": "Plaintext request/response field layouts for actions 16, 31, 1, 2, 9, 3, 17",
  "Q-010": "Conversation and Message object schemas",
  "Q-011": "QR-mode lifecycle: RegisterRefresh host/network, RevokeRelayPairing layout, keep-alive, activation",
} as const;

export type SpecGapId = keyof typeof SPEC_GAPS;

export class SpecGapError extends Error {
  constructor(readonly gap: SpecGapId) {
    super(`Spec gap ${gap}: ${SPEC_GAPS[gap]} (GitHub issue #${Number(gap.slice(2))}, label spec-question)`);
    this.name = "SpecGapError";
  }
}
