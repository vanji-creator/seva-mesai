/** Strip spaces, dots and common Tamil honorifics so "திரு. முருகன்" ~ "முருகன்". */
export function normaliseName(s: string): string {
  return s
    .normalize("NFC")
    .replace(/(திரு|திருமதி|செல்வி|Mr|Mrs|Ms)\.?/gi, "")
    .replace(/[\s.\-]/g, "")
    .toLowerCase();
}

function levenshtein(a: string[], b: string[]): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return dp[a.length][b.length];
}

/**
 * Sound-alike key for Roman-letter Tamil names. Tamil script writes k/g, t/d, p/b with one
 * letter each (க, த, ப), so "கோவிந்தன்" transliterates to "Kovindan" while a deed may say
 * "Govindan". Used only when comparing names across scripts.
 */
export function romanKey(s: string): string {
  return normaliseName(s)
    .replace(/[^a-z]/g, "")
    .replace(/zh/g, "l")
    .replace(/([kgtdpbcs])h/g, "$1")
    .replace(/g/g, "k").replace(/d/g, "t").replace(/b/g, "p").replace(/j/g, "c").replace(/w/g, "v")
    .replace(/aa/g, "a").replace(/(ee|ii)/g, "i").replace(/(oo|uu)/g, "u")
    .replace(/(.)\1+/g, "$1");
}

/** 0..1 similarity over Unicode code points (safe for Tamil, unlike .length). */
export function similarity(x: string, y: string): number {
  const a = [...normaliseName(x)];
  const b = [...normaliseName(y)];
  if (!a.length && !b.length) return 1;
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
}
