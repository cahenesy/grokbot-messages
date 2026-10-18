import { describe, expect, it } from "vitest";
import { JsonArrayStreamSplitter } from "../src/transport/streamSplitter.js";

describe("JsonArrayStreamSplitter", () => {
  it("emits elements across arbitrary chunk boundaries, including brackets inside strings", () => {
    const s = new JsonArrayStreamSplitter();
    const text = '[{"1":["a]b",null,[1,2]]}\n,{"2":[0,"ok \\"q\\" ]"]}]';
    const got: unknown[] = [];
    for (const ch of text) got.push(...s.push(ch));
    expect(got).toEqual([{ "1": ["a]b", null, [1, 2]] }, { "2": [0, 'ok "q" ]'] }]);
    expect(s.done).toBe(true);
  });

  it("emits a whole element from one chunk", () => {
    expect(new JsonArrayStreamSplitter().push('[[1,[2]],[3]')).toEqual([[1, [2]], [3]]);
  });

  it("rejects a non-array stream", () => {
    expect(() => new JsonArrayStreamSplitter().push("{")).toThrow();
  });
});
