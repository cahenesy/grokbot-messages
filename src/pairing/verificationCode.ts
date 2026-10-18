// Google-account pairing verification code (spec answer A-015 on #15), from Google's public pair-page
// module `MqwFTd` [P@484686], [P@491449–494473]. Inputs: the 32-byte UKEY2 auth key (HKDF "UKEY2 v1 auth")
// and the round-1 response f6 value. The tables are reproduced exactly as published in A-015.

/** Original table, 305 entries (🍞 U+1F35E appears twice, at 133 and 288) [P@492230]. */
export const EMOJI_ORIGINAL: readonly string[] = ["\ud83d\ude01", "\ud83d\ude05", "\ud83e\udd23", "\ud83e\udee0", "\ud83e\udd70", "\ud83d\ude07", "\ud83e\udd29", "\ud83d\ude18", "\ud83d\ude1c", "\ud83e\udd17", "\ud83e\udd14", "\ud83e\udd10", "\ud83d\ude34", "\ud83e\udd76", "\ud83e\udd2f", "\ud83e\udd20", "\ud83e\udd73", "\ud83e\udd78", "\ud83d\ude0e", "\ud83e\udd13", "\ud83e\uddd0", "\ud83e\udd79", "\ud83d\ude2d", "\ud83d\ude31", "\ud83d\ude16", "\ud83e\udd71", "\ud83d\ude2e\u200d\ud83d\udca8", "\ud83e\udd21", "\ud83d\udca9", "\ud83d\udc7b", "\ud83d\udc7d", "\ud83e\udd16", "\ud83d\ude3b", "\ud83d\udc8c", "\ud83d\udc98", "\ud83d\udc95", "\u2764", "\ud83d\udca2", "\ud83d\udca5", "\ud83d\udcab", "\ud83d\udcac", "\ud83d\uddef", "\ud83d\udca4", "\ud83d\udc4b", "\ud83d\ude4c", "\ud83d\ude4f", "\u270d", "\ud83e\uddb6", "\ud83d\udc42", "\ud83e\udde0", "\ud83e\uddb4", "\ud83d\udc40", "\ud83e\uddd1", "\ud83e\uddda", "\ud83e\uddcd", "\ud83d\udc63", "\ud83d\udc35", "\ud83d\udc36", "\ud83d\udc3a", "\ud83e\udd8a", "\ud83e\udd81", "\ud83d\udc2f", "\ud83e\udd93", "\ud83e\udd84", "\ud83d\udc11", "\ud83d\udc2e", "\ud83d\udc37", "\ud83d\udc3f", "\ud83d\udc30", "\ud83e\udd87", "\ud83d\udc3b", "\ud83d\udc28", "\ud83d\udc3c", "\ud83e\udda5", "\ud83d\udc3e", "\ud83d\udc14", "\ud83d\udc25", "\ud83d\udc26", "\ud83d\udd4a", "\ud83e\udd86", "\ud83e\udd89", "\ud83e\udeb6", "\ud83e\udda9", "\ud83d\udc38", "\ud83d\udc22", "\ud83e\udd8e", "\ud83d\udc0d", "\ud83d\udc33", "\ud83d\udc2c", "\ud83e\uddad", "\ud83d\udc20", "\ud83d\udc21", "\ud83e\udd88", "\ud83e\udeb8", "\ud83d\udc0c", "\ud83e\udd8b", "\ud83d\udc1b", "\ud83d\udc1d", "\ud83d\udc1e", "\ud83e\udeb1", "\ud83d\udc90", "\ud83c\udf38", "\ud83c\udf39", "\ud83c\udf3b", "\ud83c\udf31", "\ud83c\udf32", "\ud83c\udf34", "\ud83c\udf35", "\ud83c\udf3e", "\u2618", "\ud83c\udf41", "\ud83c\udf42", "\ud83c\udf44", "\ud83e\udeba", "\ud83c\udf47", "\ud83c\udf48", "\ud83c\udf49", "\ud83c\udf4b", "\ud83c\udf4c", "\ud83c\udf4d", "\ud83c\udf4e", "\ud83c\udf50", "\ud83c\udf52", "\ud83c\udf53", "\ud83e\udd5d", "\ud83e\udd65", "\ud83e\udd51", "\ud83e\udd55", "\ud83c\udf3d", "\ud83c\udf36", "\ud83e\uded1", "\ud83e\udd66", "\ud83e\udd5c", "\ud83c\udf5e", "\ud83e\udd50", "\ud83e\udd68", "\ud83e\uddc0", "\ud83c\udf57", "\ud83c\udf54", "\ud83c\udf5f", "\ud83c\udf55", "\ud83c\udf2d", "\ud83c\udf2e", "\ud83e\udd57", "\ud83e\udd63", "\ud83c\udf7f", "\ud83e\udd80", "\ud83e\udd91", "\ud83c\udf66", "\ud83c\udf69", "\ud83c\udf6a", "\ud83c\udf6b", "\ud83c\udf70", "\ud83c\udf6c", "\ud83c\udf6d", "\u2615", "\ud83e\uded6", "\ud83c\udf79", "\ud83e\udd64", "\ud83e\uddca", "\ud83e\udd62", "\ud83c\udf7d", "\ud83e\udd44", "\ud83e\udded", "\ud83c\udfd4", "\ud83c\udf0b", "\ud83c\udfd5", "\ud83c\udfd6", "\ud83e\udeb5", "\ud83c\udfd7", "\ud83c\udfe1", "\ud83c\udff0", "\ud83d\udedd", "\ud83d\ude82", "\ud83d\udef5", "\ud83d\udef4", "\ud83d\udefc", "\ud83d\udea5", "\u2693", "\ud83d\udedf", "\u26f5", "\u2708", "\ud83d\ude80", "\ud83d\udef8", "\ud83e\uddf3", "\u23f0", "\ud83c\udf19", "\ud83c\udf21", "\ud83c\udf1e", "\ud83e\ude90", "\ud83c\udf20", "\ud83c\udf27", "\ud83c\udf00", "\ud83c\udf08", "\u2602", "\u26a1", "\u2744", "\u26c4", "\ud83d\udd25", "\ud83c\udf87", "\ud83e\udde8", "\u2728", "\ud83c\udf88", "\ud83c\udf89", "\ud83c\udf81", "\ud83c\udfc6", "\ud83c\udfc5", "\u26bd", "\u26be", "\ud83c\udfc0", "\ud83c\udfd0", "\ud83c\udfc8", "\ud83c\udfbe", "\ud83c\udfb3", "\ud83c\udfd3", "\ud83e\udd4a", "\u26f3", "\u26f8", "\ud83c\udfaf", "\ud83e\ude81", "\ud83d\udd2e", "\ud83c\udfae", "\ud83e\udde9", "\ud83e\uddf8", "\ud83e\udea9", "\ud83d\uddbc", "\ud83c\udfa8", "\ud83e\uddf5", "\ud83e\uddf6", "\ud83e\uddba", "\ud83e\udde3", "\ud83e\udde4", "\ud83e\udde6", "\ud83c\udf92", "\ud83e\ude74", "\ud83d\udc5f", "\ud83d\udc51", "\ud83d\udc52", "\ud83c\udfa9", "\ud83e\udde2", "\ud83d\udc8e", "\ud83d\udd14", "\ud83c\udfa4", "\ud83d\udcfb", "\ud83c\udfb7", "\ud83e\ude97", "\ud83c\udfb8", "\ud83c\udfba", "\ud83c\udfbb", "\ud83e\udd41", "\ud83d\udcfa", "\ud83d\udd0b", "\ud83d\udcbb", "\ud83d\udcbf", "\u260e", "\ud83d\udd6f", "\ud83d\udca1", "\ud83d\udcd6", "\ud83d\udcda", "\ud83d\udcec", "\u270f", "\u2712", "\ud83d\udd8c", "\ud83d\udd8d", "\ud83d\udcdd", "\ud83d\udcbc", "\ud83d\udccb", "\ud83d\udccc", "\ud83d\udcce", "\ud83d\udd11", "\ud83d\udd27", "\ud83e\uddf2", "\ud83e\ude9c", "\ud83e\uddec", "\ud83d\udd2d", "\ud83e\ude79", "\ud83e\ude7a", "\ud83e\ude9e", "\ud83d\udecb", "\ud83e\ude91", "\ud83d\udec1", "\ud83e\uddf9", "\ud83e\uddfa", "\ud83d\udd31", "\ud83c\udfc1", "\ud83d\udc2a", "\ud83d\udc18", "\ud83e\udd83", "\ud83c\udf5e", "\ud83c\udf5c", "\ud83c\udf60", "\ud83d\ude98", "\ud83e\udd3f", "\ud83c\udccf", "\ud83d\udc55", "\ud83d\udcf8", "\ud83c\udff7", "\u2702", "\ud83e\uddea", "\ud83d\udeaa", "\ud83e\uddf4", "\ud83e\uddfb", "\ud83e\udea3", "\ud83e\uddfd", "\ud83d\udeb8"];

/** Rev1 additions, in order [P@484686]. */
export const EMOJI_REV1_ADDITIONS: readonly string[] = ["\ud83c\udf4b\u200d\ud83d\udfe9", "\ud83d\udc26\u200d\ud83d\udd25", "\ud83d\udc32", "\ud83e\ude85", "\ud83e\udd9c", "\ud83c\udffa", "\ud83d\uddff", "\ud83e\uded0", "\u26fd", "\ud83c\udf71", "\ud83e\udd61", "\ud83e\uddcb", "\ud83c\udf7c", "\ud83d\udcd0"];

/** Rev1 deletions [P@484686]. */
export const EMOJI_REV1_DELETIONS: readonly string[] = ["\ud83d\udcbb", "\ud83e\udd17", "\ud83d\udcac", "\ud83d\udc4b", "\ud83d\ude01", "\ud83d\ude0e", "\ud83d\ude07", "\ud83e\udd70", "\ud83e\udd13", "\ud83e\udd29"];

/** Rev1: original de-duplicated (first occurrence kept), + additions, − deletions → 308 entries. */
export const EMOJI_REV1: readonly string[] = (() => {
  const seen: string[] = [];
  for (const e of EMOJI_ORIGINAL) if (!seen.includes(e)) seen.push(e);
  const del = new Set(EMOJI_REV1_DELETIONS);
  return [...seen, ...EMOJI_REV1_ADDITIONS].filter((e) => !del.has(e));
})();

export interface VerificationCode {
  emoji: string;
  /** 3-digit code for the screen-reader announcement [P@489777], [P@492805]. */
  digits: string;
}

/**
 * n = uint32 big-endian of authKey[0..4] [P@491449]. f6 ≥ 1 → EMOJI_REV1[n % 308]; f6 = 0 → EMOJI_ORIGINAL[n % 305].
 * f6 > 1 is unsupported (the round-1 cap already rejects it). Digits: m = n % 1000, then m % 10,
 * Math.round(m/10) % 10, Math.round(m/100) % 10 (Math.round, not floor).
 */
export function verificationCode(authKey: Uint8Array, f6: bigint | number): VerificationCode {
  if (authKey.length < 4) throw new RangeError("auth key too short");
  const v = BigInt(f6);
  if (v > 1n || v < 0n) throw new RangeError("unsupported verification-code revision");
  const n = new DataView(authKey.buffer, authKey.byteOffset, authKey.byteLength).getUint32(0, false);
  const table = v >= 1n ? EMOJI_REV1 : EMOJI_ORIGINAL;
  const m = n % 1000;
  return { emoji: table[n % table.length]!, digits: `${m % 10}${Math.round(m / 10) % 10}${Math.round(m / 100) % 10}` };
}
