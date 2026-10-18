import { describe, expect, it } from "vitest";
import { receiveMessages } from "../src/transport/receive.js";
import { SpecGapError } from "../src/protocol/specGaps.js";

function streamingFetch(chunks: string[]): typeof fetch {
  return (async () =>
    new Response(
      new ReadableStream({
        start(c) {
          for (const ch of chunks) c.enqueue(new TextEncoder().encode(ch));
          c.close();
        },
      }),
      { status: 200 },
    )) as typeof fetch;
}

describe("receiveMessages", () => {
  it("yields elements split across network chunks", async () => {
    const got = [];
    for await (const el of receiveMessages({ apiKey: "k", body: [], fetchImpl: streamingFetch(['[{"1":[nu', 'll,14]},{"2":[0]}', "]"]) }))
      got.push(el);
    expect(got).toEqual([{ response: [null, 14], status: undefined }, { response: undefined, status: [0] }]);
  });

  it("requires a request body layout (Q-004)", async () => {
    await expect(receiveMessages({ apiKey: "k", fetchImpl: streamingFetch([]) }).next()).rejects.toBeInstanceOf(SpecGapError);
  });
});
