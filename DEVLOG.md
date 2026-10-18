# DEVLOG — sources consulted

Required by clean-room rule 5 (`docs/handoff/README.md`). This log names every URL, document, and capture used while implementing. No secrets go here.

## 2026-10-18

- Handoff package received (version 2026-10-18): `docs/handoff/SPEC.md` v0.2, `OPEN-QUESTIONS.md`, `IMPLEMENTATION-PLAN.md`, `QUESTIONS.md`, `README.md`.
- No other sources consulted yet.
- Public protobuf wire-format knowledge (varint/length-delimited encoding) used for `src/protocol/protobuf.ts`; written from the encoding rules, not from any library source.
- Apache-2.0 license text: https://www.apache.org/licenses/LICENSE-2.0.txt
- Grok Bot hosting environment: web search "Grok Bot connector marketplace plugin requirements license MCP"; https://composio.dev/content/how-to-add-mcp-servers-to-grok-bot (Grok Bot runs stdio MCP servers on a cloud computer). No license requirements found there.
- npm package metadata only (versions, license fields) for @modelcontextprotocol/sdk, zod, qrcode, vitest, typescript.
- Not consulted: any item on the handoff do-not-open list.
