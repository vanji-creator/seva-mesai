/**
 * Renders every eval case into every document variant using headless Chrome
 * (+ macOS `sips` for JPEG compression / down-sampling).
 *
 *   npm run eval:render            -> eval/docs/<case>/<variant>.<ext>
 *
 * All content is fictional and stamped "மாதிரி / SAMPLE".
 */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { CASES, VARIANTS, type EvalCase, type VariantId } from "./cases";

const ROOT = path.resolve(__dirname, "docs");
const BUILD = path.resolve(__dirname, ".build");
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const FONTS =
  '<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Tamil:wght@400;700&family=Noto+Serif+Tamil:wght@400;700&family=Kavivanar&display=swap" rel="stylesheet">';

const fmtDate = (iso: string) => iso.split("-").reverse().join("-");
const fmtInr = (n: number) => n.toLocaleString("en-IN");

const SEAL = `<svg width="190" height="190" viewBox="0 0 190 190" style="position:absolute;opacity:.62;transform:rotate(-14deg)">
  <defs><path id="c" d="M95,95 m-72,0 a72,72 0 1,1 144,0 a72,72 0 1,1 -144,0"/></defs>
  <circle cx="95" cy="95" r="88" fill="none" stroke="#5b2a9e" stroke-width="5"/>
  <circle cx="95" cy="95" r="58" fill="none" stroke="#5b2a9e" stroke-width="2"/>
  <text font-size="15" fill="#5b2a9e" font-family="Noto Sans Tamil"><textPath href="#c">சார் பதிவாளர் அலுவலகம் · பதிவுத்துறை · தமிழ்நாடு ·</textPath></text>
  <text x="95" y="90" text-anchor="middle" font-size="20" fill="#5b2a9e" font-family="Noto Sans Tamil" font-weight="700">பதிவு</text>
  <text x="95" y="115" text-anchor="middle" font-size="14" fill="#5b2a9e" font-family="Noto Sans Tamil">முத்திரை</text></svg>`;

const SIGN = `<svg width="160" height="50" viewBox="0 0 160 50"><path d="M5 35 C 25 5, 35 45, 55 20 S 85 40, 95 15 S 130 45, 155 10" stroke="#1b2f7a" stroke-width="2.4" fill="none"/></svg>`;

const NOISE = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23n)' opacity='0.55'/%3E%3C/svg%3E")`;

function names(c: EvalCase, v: VariantId) {
  if (v === "english_names") return c.roman;
  return { seller: c.deed.seller, buyer: c.deed.buyer, sellerParent: c.sellerParent, buyerParent: c.buyerParent };
}

/** The standard prose deed body (all variants except the handwritten form). */
function deedBody(c: EvalCase, v: VariantId) {
  const n = names(c, v);
  const d = c.deed;
  return `
  <h1>கிரையப் பத்திரம்</h1>
  <div class="sub">பத்திர எண்: ${d.deedNo} · சார் பதிவாளர் அலுவலகம், ${c.village} · பதிவு நாள்: ${fmtDate(d.registrationDate)}</div>
  <p>இந்தக் கிரையப் பத்திரம், திருவள்ளூர் மாவட்டம், ${c.village} வட்டம், ${c.village} கிராமத்தைச் சேர்ந்த
  <b>${n.seller}</b> (த/பெ. ${n.sellerParent}), இனி "விற்பவர்" என்று குறிப்பிடப்படுபவர், மற்றும்
  <b>${n.buyer}</b> (த/பெ. ${n.buyerParent}), இனி "வாங்குபவர்" என்று குறிப்பிடப்படுபவர், ஆகியோருக்கிடையே எழுதிக்கொள்ளப்பட்டது.</p>
  <p>விற்பவர் கீழ்க்கண்ட சொத்தை ரூ. ${fmtInr(d.saleAmount)}/- கிரையத் தொகைக்கு வாங்குபவருக்கு முழுமையாக விற்பனை செய்கிறார். இத்தொகையை விற்பவர் முழுமையாகப் பெற்றுக்கொண்டார்.</p>
  <table>
    <tr><td>சர்வே எண்</td><td>${d.surveyNo}</td></tr>
    <tr><td>பரப்பு</td><td>${d.extentCents} சென்ட்</td></tr>
    <tr><td>நில வகை</td><td>நஞ்சை</td></tr>
    <tr><td>எல்லைகள்</td><td>கிழக்கு: பொதுச் சாலை; மேற்கு: தனியார் நிலம்; வடக்கு: கால்வாய்; தெற்கு: வண்டிப் பாதை</td></tr>
  </table>
  <p>இந்தச் சொத்தின் மீது எந்தவித அடமானமோ, வில்லங்கமோ இல்லை என விற்பவர் உறுதியளிக்கிறார்.</p>
  <div class="signs"><div>${SIGN}<br>விற்பவர்</div><div>${SIGN}<br>வாங்குபவர்</div></div>
  <p class="wit">சாட்சிகள்: 1. சு. வேலுசாமி &nbsp;&nbsp; 2. க. அன்பழகன்</p>
  <p class="fic">இது கற்பனையான மாதிரி ஆவணம் (மதிப்பீட்டுக்காக). உண்மையான நபர்கள் அல்லது சொத்துகளுடன் தொடர்பில்லை.</p>`;
}

/** Old-style printed form with blanks filled by hand (Kavivanar = Tamil handwriting font). */
function handwrittenBody(c: EvalCase) {
  const d = c.deed;
  const hw = (s: string | number, r = 0) => `<span class="hw" style="transform:rotate(${r}deg)">${s}</span>`;
  return `
  <h1>கிரையப் பத்திரம் – படிவம்</h1>
  <div class="sub">சார் பதிவாளர் அலுவலகம், ${c.village}</div>
  <div class="row"><span>பத்திர எண்:</span>${hw(d.deedNo, -1)}<span>பதிவு நாள்:</span>${hw(fmtDate(d.registrationDate), 1)}</div>
  <div class="row"><span>விற்பவர் பெயர்:</span>${hw(d.seller, -2)}<span>த/பெ:</span>${hw(c.sellerParent, 1)}</div>
  <div class="row"><span>வாங்குபவர் பெயர்:</span>${hw(d.buyer, 1.5)}<span>த/பெ:</span>${hw(c.buyerParent, -1)}</div>
  <div class="row"><span>கிராமம்:</span>${hw(c.village, -1)}<span>சர்வே எண்:</span>${hw(d.surveyNo, 2)}</div>
  <div class="row"><span>பரப்பு (சென்ட்):</span>${hw(d.extentCents, -1.5)}<span>கிரையத் தொகை (ரூ.):</span>${hw(fmtInr(d.saleAmount), 1)}</div>
  <p>மேற்கண்ட சொத்தை விற்பவர் வாங்குபவருக்கு முழுமையாக விற்பனை செய்கிறார். சொத்தின் மீது அடமானம் / வில்லங்கம் இல்லை.</p>
  <div class="signs"><div>${SIGN}<br>விற்பவர்</div><div>${SIGN}<br>வாங்குபவர்</div></div>
  <p class="fic">இது கற்பனையான மாதிரி ஆவணம் (மதிப்பீட்டுக்காக).</p>`;
}

const BASE_CSS = `
  *{box-sizing:border-box} body{margin:0;background:#fff}
  .page{position:relative;width:780px;padding:40px 44px;background:#fffdf7;font-family:'Noto Serif Tamil',serif;font-size:16px;line-height:1.85;color:#141414}
  h1{text-align:center;font-size:25px;margin:0} .sub{text-align:center;color:#444;margin:4px 0 16px;font-size:14px}
  table{border-collapse:collapse;width:100%;margin:12px 0} td{border:1px solid #444;padding:5px 10px}
  .signs{display:flex;justify-content:space-around;text-align:center;font-size:13px;margin-top:10px}
  .wit{margin-top:6px} .fic{color:#777;font-size:11px;margin-top:14px}
  .wm{position:absolute;top:42%;left:12%;font-size:86px;color:rgba(200,0,0,.07);transform:rotate(-25deg);font-family:'Noto Sans Tamil';pointer-events:none}
  .row{display:flex;gap:8px;align-items:baseline;margin:14px 0;flex-wrap:wrap}
  .row span:not(.hw){color:#333;white-space:nowrap}
  .hw{display:inline-block;min-width:150px;border-bottom:1.5px dotted #555;font-family:'Kavivanar',cursive;font-size:23px;color:#1b2f7a;padding:0 8px;margin-right:16px}
`;

function pageHtml(c: EvalCase, v: VariantId): { html: string; width: number; height: number } {
  const body = v === "handwritten_form" ? handwrittenBody(c) : deedBody(c, v);
  let extraCss = "";
  let pre = "";
  let wrapOpen = "";
  let wrapClose = "";
  let width = 780;
  let height = 1060;

  if (v === "stamp_paper") {
    pre = `<div style="border:3px double #2f6b3a;background:linear-gradient(#e8f3e4,#f6fbf2);padding:10px;text-align:center;font-family:'Noto Sans Tamil';color:#2f6b3a;margin-bottom:14px">
      <b>இந்திய அரசு · தமிழ்நாடு முத்திரைத்தாள்</b><br><span style="font-size:28px;font-weight:700">₹ 100</span> · நீதிமன்றம் சாரா முத்திரைத்தாள் · மாதிரி</div>
      <div style="position:absolute;top:255px;left:320px">${SEAL}</div>
      <div style="position:absolute;top:500px;left:140px">${SEAL}</div>`;
    extraCss = `.page{background:repeating-linear-gradient(45deg,#fbfdf6,#fbfdf6 12px,#f1f7ea 12px,#f1f7ea 24px)} .wm{color:rgba(47,107,58,.12)}`;
    height = 1200;
  }
  if (v === "phone_photo") {
    wrapOpen = `<div style="width:1000px;height:1250px;background:radial-gradient(circle at 30% 20%,#8a6a4a,#4b3826);display:flex;align-items:center;justify-content:center;overflow:hidden">
      <div style="transform:perspective(1400px) rotateX(7deg) rotateY(-4deg) rotateZ(-3.5deg);box-shadow:0 30px 60px rgba(0,0,0,.55);filter:blur(0.8px) brightness(.93) contrast(.92)">`;
    wrapClose = `</div><div style="position:absolute;inset:0;background:linear-gradient(115deg,rgba(0,0,0,.0) 35%,rgba(0,0,0,.28) 70%,rgba(0,0,0,.4))"></div></div>`;
    width = 1000;
    height = 1250;
  }
  if (v === "photocopy") {
    // Toner noise + streak + dark copier edge, slightly rotated, then greyscale/contrast/blur on the whole sheet.
    wrapOpen = `<div style="position:relative;width:780px;filter:grayscale(1) contrast(1.9) brightness(1.08) blur(1.1px);transform:rotate(1.2deg);transform-origin:top left">`;
    wrapClose = `<div style="position:absolute;inset:0;background:${NOISE};opacity:.75;mix-blend-mode:multiply"></div>
      <div style="position:absolute;top:0;bottom:0;left:0;width:26px;background:linear-gradient(90deg,#222,rgba(0,0,0,0))"></div>
      <div style="position:absolute;top:0;bottom:0;left:61%;width:5px;background:rgba(0,0,0,.18)"></div></div>`;
    extraCss = `.page{background:#e4e4e4} .page b{font-weight:400}`;
  }

  const html = `<!doctype html><html lang="ta"><head><meta charset="utf-8">${FONTS}<style>${BASE_CSS}${extraCss}</style></head>
  <body>${wrapOpen}<div class="page"><div class="wm">மாதிரி / SAMPLE</div>${pre}${body}</div>${wrapClose}</body></html>`;
  return { html, width, height };
}

function chrome(args: string[]) {
  execFileSync(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--virtual-time-budget=8000", ...args], { stdio: "ignore" });
}

function sips(args: string[]) {
  execFileSync("sips", args, { stdio: "ignore" });
}

function renderOne(c: EvalCase, v: VariantId) {
  const variant = VARIANTS.find((x) => x.id === v)!;
  if (!variant.file) return null;
  const { html, width, height } = pageHtml(c, v);
  const dir = path.join(ROOT, c.id);
  mkdirSync(dir, { recursive: true });
  const src = path.join(BUILD, `${c.id}_${v}.html`);
  writeFileSync(src, html);
  const out = path.join(dir, `${v}.${variant.file}`);

  if (variant.file === "pdf") {
    chrome(["--no-pdf-header-footer", `--print-to-pdf=${out}`, `file://${src}`]);
  } else {
    const png = variant.file === "png" ? out : path.join(BUILD, `${c.id}_${v}.png`);
    chrome([`--window-size=${width},${height}`, `--screenshot=${png}`, `file://${src}`]);
    if (v === "phone_photo") {
      sips(["-s", "format", "jpeg", "-s", "formatOptions", "55", png, "--out", out]);
    } else if (v === "photocopy") {
      // Down-sample (lost detail) then heavy JPEG compression, like a cheap copier + scan.
      sips(["--resampleWidth", "520", png, "--out", png]);
      sips(["-s", "format", "jpeg", "-s", "formatOptions", "35", png, "--out", out]);
    }
  }
  return out;
}

function wrongDocs() {
  const dir = path.join(ROOT, "_wrong");
  mkdirSync(dir, { recursive: true });
  const docs: Record<string, string> = {
    wrong_ration_card: `<div style="border:3px solid #2a6;padding:24px"><h2>தமிழ்நாடு அரசு – குடும்ப அட்டை</h2>
      <p>அட்டை எண்: 33XX-0000-4821</p><p>குடும்பத் தலைவர்: மீனா</p><p>முகவரி: 4, காந்தி தெரு, பொன்னேரி</p>
      <p>உறுப்பினர்கள்: 3 · அட்டை வகை: PHH – அரிசி</p></div>`,
    wrong_tax_receipt: `<div style="border:2px solid #333;padding:24px"><h2>ஊராட்சி – சொத்து வரி ரசீது</h2>
      <p>ரசீது எண்: TX/0104 · சர்வே எண்: 201/7</p><p>செலுத்தியவர்: கோவிந்தன்</p>
      <p>செலுத்திய தொகை: ரூ. 1,240 · ஆண்டு: 2026-27</p><p>நிலுவை: இல்லை</p></div>`,
  };
  for (const [id, inner] of Object.entries(docs)) {
    const src = path.join(BUILD, `${id}.html`);
    writeFileSync(src, `<!doctype html><html lang="ta"><head><meta charset="utf-8">${FONTS}<style>${BASE_CSS}</style></head>
      <body><div class="page" style="font-family:'Noto Sans Tamil'"><div class="wm">மாதிரி / SAMPLE</div>${inner}
      <p class="fic">கற்பனையான மாதிரி ஆவணம்.</p></div></body></html>`);
    chrome([`--window-size=780,700`, `--screenshot=${path.join(dir, `${id}.png`)}`, `file://${src}`]);
  }
}

function main() {
  if (!existsSync(CHROME)) throw new Error(`Chrome not found at ${CHROME}; set CHROME_PATH`);
  rmSync(BUILD, { recursive: true, force: true });
  mkdirSync(BUILD, { recursive: true });
  for (const c of CASES) {
    for (const v of VARIANTS) {
      const out = renderOne(c, v.id);
      if (out) console.log("rendered", path.relative(process.cwd(), out));
    }
  }
  wrongDocs();
  console.log("rendered wrong-document samples");
  rmSync(BUILD, { recursive: true, force: true });

  // Thumbnails for the in-app Evals page (one case is enough to show what each variant looks like).
  const pub = path.resolve(__dirname, "../public/eval-samples");
  rmSync(pub, { recursive: true, force: true });
  cpSync(path.join(ROOT, SAMPLE_CASE), pub, { recursive: true });
  console.log("copied", SAMPLE_CASE, "samples to public/eval-samples");
}

export const SAMPLE_CASE = "PT-2026-0104";

main();
