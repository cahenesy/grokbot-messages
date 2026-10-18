// Incremental splitter for a streamed top-level JSON array (`[elem,elem,...]`), as used by
// gRPC-Web JSPB server streaming (SPEC.md §3 "Streaming"). Emits each complete element
// as soon as its closing bracket/brace arrives. Handles strings and escapes; elements are
// returned as parsed JSON values.

export class JsonArrayStreamSplitter {
  private buf = "";
  private started = false;
  private depth = 0;
  private inString = false;
  private escaped = false;
  private elemStart = -1;
  private scanPos = 0;
  private ended = false;

  /** Feed a text chunk; returns the elements completed by it. */
  push(chunk: string): unknown[] {
    if (this.ended) {
      if (chunk.trim()) throw new Error("data after end of stream array");
      return [];
    }
    this.buf += chunk;
    const out: unknown[] = [];
    for (let i = this.scanPos; i < this.buf.length; i++) {
      const c = this.buf[i]!;
      if (!this.started) {
        if (c === "[") this.started = true;
        else if (!/\s/.test(c)) throw new Error(`stream does not start with '[' (got '${c}')`);
        continue;
      }
      if (this.inString) {
        if (this.escaped) this.escaped = false;
        else if (c === "\\") this.escaped = true;
        else if (c === '"') this.inString = false;
        continue;
      }
      if (this.depth === 0) {
        if (c === "," || /\s/.test(c)) continue;
        if (c === "]") {
          this.ended = true;
          this.buf = "";
          this.scanPos = 0;
          return out;
        }
        this.elemStart = i;
      }
      if (c === '"') {
        this.inString = true;
        if (this.depth === 0) throw new Error("bare string elements are not supported");
      } else if (c === "[" || c === "{") this.depth++;
      else if (c === "]" || c === "}") {
        this.depth--;
        if (this.depth === 0) {
          out.push(JSON.parse(this.buf.slice(this.elemStart, i + 1)));
          this.buf = this.buf.slice(i + 1);
          i = -1;
          this.elemStart = -1;
        }
      } else if (this.depth === 0) throw new Error(`unexpected scalar element at top level ('${c}')`);
    }
    this.scanPos = this.buf.length;
    return out;
  }

  get done(): boolean {
    return this.ended;
  }
}
