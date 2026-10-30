/**
 * Renders every case's documents into public/case-docs/<ref>/ using headless Chrome
 * (+ macOS `sips` for JPEG compression). All content is fictional and marked "மாதிரி / SAMPLE".
 *
 *   npm run render:cases
 *   npm run render:cases -- --kits     (only the citizen demo kits, public/demo-kits/)
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  DEMO_KITS, GRIEVANCE_CASES, PATTA_CASES, applicationValues, formatHectareAres, lookExt,
  type DocKind, type GrievanceCase, type Look, type PattaCase,
} from "../src/db/cases";

const OUT = path.resolve(__dirname, "../public/case-docs");
const BUILD = path.resolve(__dirname, ".build");
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const FONTS =
  '<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Tamil:wght@400;600;700&family=Noto+Serif+Tamil:wght@400;700&family=Kavivanar&display=swap" rel="stylesheet">';
const d = (iso: string) => iso.split("-").reverse().join("-");
const inr = (n: number) => n.toLocaleString("en-IN");

const SEAL = (label: string) => `<svg width="170" height="170" viewBox="0 0 190 190" style="position:absolute;opacity:.6;transform:rotate(-14deg)">
  <defs><path id="c" d="M95,95 m-72,0 a72,72 0 1,1 144,0 a72,72 0 1,1 -144,0"/></defs>
  <circle cx="95" cy="95" r="88" fill="none" stroke="#5b2a9e" stroke-width="5"/><circle cx="95" cy="95" r="58" fill="none" stroke="#5b2a9e" stroke-width="2"/>
  <text font-size="15" fill="#5b2a9e" font-family="Noto Sans Tamil"><textPath href="#c">${label} · மாதிரி ·</textPath></text>
  <text x="95" y="102" text-anchor="middle" font-size="20" fill="#5b2a9e" font-family="Noto Sans Tamil" font-weight="700">முத்திரை</text></svg>`;
const SIGN = `<svg width="150" height="44" viewBox="0 0 160 50"><path d="M5 35 C 25 5, 35 45, 55 20 S 85 40, 95 15 S 130 45, 155 10" stroke="#1b2f7a" stroke-width="2.4" fill="none"/></svg>`;
const NOISE = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23n)' opacity='0.55'/%3E%3C/svg%3E")`;

const CSS = `
  *{box-sizing:border-box} body{margin:0;background:#fff}
  .page{position:relative;width:780px;padding:40px 46px;background:#fffefb;font-family:'Noto Serif Tamil',serif;font-size:15.5px;line-height:1.8;color:#151515}
  .sans{font-family:'Noto Sans Tamil',sans-serif}
  h1{text-align:center;font-size:23px;margin:0} h2{font-size:17px;margin:18px 0 6px}
  .sub{text-align:center;color:#444;margin:4px 0 16px;font-size:13.5px}
  table{border-collapse:collapse;width:100%;margin:10px 0;font-size:14.5px} td,th{border:1px solid #555;padding:5px 9px;text-align:left;vertical-align:top} th{background:#f1efe8;font-weight:600}
  .kv td:first-child{width:38%;color:#333}
  .signs{display:flex;justify-content:space-around;text-align:center;font-size:13px;margin-top:12px}
  .fic{color:#777;font-size:11px;margin-top:14px}
  .wm{position:absolute;top:40%;left:14%;font-size:84px;color:rgba(200,0,0,.07);transform:rotate(-25deg);font-family:'Noto Sans Tamil';pointer-events:none;white-space:nowrap}
  .hw{font-family:'Kavivanar',cursive;color:#1b2f7a;font-size:22px}
  .row{display:flex;gap:8px;align-items:baseline;margin:13px 0;flex-wrap:wrap}
  .row .hw{display:inline-block;min-width:150px;border-bottom:1.5px dotted #555;padding:0 8px;margin-right:16px}
  .gov{text-align:center;font-family:'Noto Sans Tamil';font-size:12.5px;color:#444;letter-spacing:.3px}
`;

const FICTION = `<p class="fic">இது கற்பனையான மாதிரி ஆவணம் (சேவை மேசை செயல்விளக்கம்). உண்மையான நபர்கள் அல்லது சொத்துகளுடன் தொடர்பில்லை.</p>`;

// ---------------- document bodies ----------------

function applicationForm(c: PattaCase) {
  const a = applicationValues(c);
  return `<div class="sans">
  <div class="gov">தமிழ்நாடு அரசு · வருவாய்த் துறை · இணையவழி விண்ணப்பம் (மாதிரி)</div>
  <h1 style="margin-top:6px">பட்டா பெயர் மாற்ற விண்ணப்பம்</h1>
  <div class="sub">விண்ணப்ப எண் ${c.ref} · சமர்ப்பித்த நாள் ${d(c.submittedOn)}</div>
  <table class="kv">
    <tr><td>விண்ணப்பதாரர்</td><td>${a.buyer} (த/பெ. ${c.buyer.parent})</td></tr>
    <tr><td>கிராமம் / வட்டம்</td><td>${c.village.ta} / பொன்னேரி, திருவள்ளூர் மாவட்டம்</td></tr>
    <tr><td>சர்வே எண்</td><td>${a.surveyNo}</td></tr>
    <tr><td>பரப்பு</td><td>${a.extentCents} சென்ட்</td></tr>
    <tr><td>விற்பவர் (தற்போதைய பட்டாதாரர்)</td><td>${a.seller}</td></tr>
    <tr><td>வாங்குபவர்</td><td>${a.buyer}</td></tr>
    <tr><td>கிரையப் பத்திர எண்</td><td>${a.saleDeedNo}, ${c.sro.ta}</td></tr>
    <tr><td>சொத்து வரி ரசீது எண்</td><td>${a.taxReceiptNo}</td></tr>
  </table>
  <h2>இணைத்த ஆவணங்கள்</h2>
  <ol style="margin:0;padding-left:22px">${(["sale_deed", "patta", "ec", "tax_receipt", "id_proof"] as const)
    .filter((k) => c.docs[k]).map((k) => `<li>${KIND_TA[k]}</li>`).join("")}</ol>
  <p style="margin-top:18px">மேலே உள்ள விவரங்கள் உண்மை என உறுதியளிக்கிறேன்.</p>
  <div class="signs" style="justify-content:flex-end"><div>${SIGN}<br>${a.buyer}</div></div></div>`;
}

const KIND_TA: Record<DocKind, string> = {
  application_form: "விண்ணப்பப் படிவம்", sale_deed: "கிரையப் பத்திரம்", patta: "பட்டா / சிட்டா",
  ec: "வில்லங்கச் சான்றிதழ்", tax_receipt: "சொத்து வரி ரசீது", id_proof: "அடையாள அட்டை", petition: "மனு",
};

function saleDeed(c: PattaCase, look: Look) {
  const extent = c.deedCopy?.extentCents ?? c.deed.extentCents;
  if (look === "handwritten") {
    const hw = (s: string | number, r = 0) => `<span class="hw" style="transform:rotate(${r}deg)">${s}</span>`;
    return `<h1>கிரையப் பத்திரம் – படிவம்</h1><div class="sub">${c.sro.ta}</div>
    <div class="row"><span>பத்திர எண்:</span>${hw(c.deed.no, -1)}<span>பதிவு நாள்:</span>${hw(d(c.deed.date), 1)}</div>
    <div class="row"><span>விற்பவர்:</span>${hw(c.seller.name, -2)}<span>த/பெ:</span>${hw(c.seller.parent, 1)}</div>
    <div class="row"><span>வாங்குபவர்:</span>${hw(c.buyer.name, 1.5)}<span>த/பெ:</span>${hw(c.buyer.parent, -1)}</div>
    <div class="row"><span>கிராமம்:</span>${hw(c.village.ta, -1)}<span>சர்வே எண்:</span>${hw(c.surveyNo, 2)}</div>
    <div class="row"><span>பரப்பு (சென்ட்):</span>${hw(extent, -1.5)}<span>கிரையத் தொகை (ரூ.):</span>${hw(inr(c.deed.amount), 1)}</div>
    <p>மேற்கண்ட சொத்தை விற்பவர் வாங்குபவருக்கு முழுமையாக விற்பனை செய்கிறார்.</p>
    <div class="signs"><div>${SIGN}<br>விற்பவர்</div><div>${SIGN}<br>வாங்குபவர்</div></div>`;
  }
  return `<h1>கிரையப் பத்திரம்</h1>
  <div class="sub">ஆவண எண் ${c.deed.no} · ${c.sro.ta} · பதிவு நாள் ${d(c.deed.date)}</div>
  <p>இந்தக் கிரையப் பத்திரம், திருவள்ளூர் மாவட்டம், பொன்னேரி வட்டம், ${c.village.ta} கிராமத்தைச் சேர்ந்த
  <b>${c.seller.name}</b> (த/பெ. ${c.seller.parent}), இனி "விற்பவர்", மற்றும்
  <b>${c.buyer.name}</b> (த/பெ. ${c.buyer.parent}), இனி "வாங்குபவர்", ஆகியோருக்கிடையே எழுதிக்கொள்ளப்பட்டது.</p>
  <p>விற்பவர் கீழ்க்கண்ட சொத்தை ரூ. ${inr(c.deed.amount)}/- கிரையத் தொகைக்கு வாங்குபவருக்கு முழுமையாக விற்பனை செய்கிறார். இத்தொகையை விற்பவர் முழுமையாகப் பெற்றுக்கொண்டார்.</p>
  <table class="kv">
    <tr><td>சர்வே எண்</td><td>${c.surveyNo}</td></tr>
    <tr><td>பரப்பு</td><td>${extent} சென்ட்</td></tr>
    <tr><td>நில வகை</td><td>நஞ்சை</td></tr>
    <tr><td>எல்லைகள்</td><td>கிழக்கு: பொதுச் சாலை; மேற்கு: தனியார் நிலம்; வடக்கு: கால்வாய்; தெற்கு: வண்டிப் பாதை</td></tr>
  </table>
  <p>இந்தச் சொத்தின் மீது வில்லங்கம் ஏதும் இல்லை என விற்பவர் உறுதியளிக்கிறார்.</p>
  <div class="signs"><div>${SIGN}<br>விற்பவர்</div><div>${SIGN}<br>வாங்குபவர்</div></div>
  <p style="margin-top:6px">சாட்சிகள்: 1. சு. வேலுசாமி &nbsp;&nbsp; 2. க. அன்பழகன்</p>`;
}

function patta(c: PattaCase) {
  return `<div class="sans">
  <div class="gov">தமிழ்நாடு அரசு · நில அளவை மற்றும் நிலவரித் திட்டத் துறை (மாதிரி)</div>
  <h1 style="margin-top:6px">நில உரிமை விவரங்கள் — பட்டா / சிட்டா</h1>
  <div class="sub">மாவட்டம்: திருவள்ளூர் · வட்டம்: பொன்னேரி · கிராமம்: ${c.village.ta}</div>
  <table class="kv">
    <tr><td>பட்டா எண்</td><td>${c.patta.no}</td></tr>
    <tr><td>உரிமையாளர் பெயர்</td><td>${c.patta.owner} (த/பெ. ${c.patta.ownerParent})</td></tr>
  </table>
  <table>
    <tr><th>சர்வே எண் / உட்பிரிவு</th><th>நில வகை</th><th>பரப்பு (ஹெக்டேர் - ஏர்ஸ்)</th><th>தீர்வை (ரூ.)</th></tr>
    <tr><td>${c.surveyNo}</td><td>நஞ்சை</td><td>${formatHectareAres(c.deed.extentCents)}</td><td>${(c.deed.extentCents * 0.42).toFixed(2)}</td></tr>
  </table>
  <p style="font-size:13px;color:#444">இந்த விவரங்கள் கிராம நிர்வாக அலுவலர் பதிவேட்டின்படி. சரிபார்ப்பு குறியீடு: ${c.patta.no}-${c.surveyNo.replace("/", "")}-MOCK</p></div>`;
}

const NATURE_TA = { sale: "கிரையம்", mortgage: "அடமானம்", release: "அடமான விடுவிப்பு", court_attachment: "நீதிமன்ற ஜப்தி" };

function ec(c: PattaCase) {
  const rows = c.ec.map((e, i) => `<tr><td>${i + 1}</td><td>${d(e.date)}</td><td>${e.docNo}</td><td>${NATURE_TA[e.nature]}</td><td>${e.parties}</td><td>${e.detail}</td></tr>`).join("");
  return `<div class="sans">
  <div class="gov">தமிழ்நாடு அரசு · பதிவுத் துறை (மாதிரி)</div>
  <h1 style="margin-top:6px">வில்லங்கச் சான்றிதழ் — படிவம் 16</h1>
  <div class="sub">${c.sro.ta} · காலம்: 01-01-2013 முதல் ${d(c.submittedOn)} வரை</div>
  <table class="kv"><tr><td>சொத்து</td><td>${c.village.ta} கிராமம், சர்வே எண் ${c.surveyNo}, ${c.deed.extentCents} சென்ட்</td></tr></table>
  <table><tr><th>வ.எண்</th><th>நாள்</th><th>ஆவண எண்</th><th>தன்மை</th><th>நிறைவேற்றியவர் → பெற்றவர்</th><th>விவரம்</th></tr>${rows}</table>
  <p style="font-size:13px">மேற்கண்டவை தவிர இக்காலத்தில் இச்சொத்தின் மீது வேறு எந்தப் பதிவும் இல்லை.</p></div>`;
}

function taxReceipt(c: PattaCase) {
  return `<div class="sans">
  <div class="gov">${c.village.ta} கிராம ஊராட்சி · சொத்து வரி (மாதிரி)</div>
  <h1 style="margin-top:6px">சொத்து வரி ரசீது</h1>
  <div class="sub">ரசீது எண் ${c.tax.receiptNo}</div>
  <table class="kv">
    <tr><td>மதிப்பீட்டு எண்</td><td>${c.tax.assessmentNo}</td></tr>
    <tr><td>சர்வே எண்</td><td>${c.surveyNo}</td></tr>
    <tr><td>செலுத்தியவர்</td><td>${c.seller.name}</td></tr>
    <tr><td>செலுத்திய ஆண்டு வரை</td><td>${c.tax.paidUpTo}</td></tr>
    <tr><td>செலுத்திய தொகை</td><td>ரூ. ${inr(c.tax.paidAmount)}</td></tr>
    <tr><td>நிலுவைத் தொகை</td><td><b>ரூ. ${inr(c.tax.dues)}</b></td></tr>
  </table>
  <div class="signs" style="justify-content:flex-end"><div>${SIGN}<br>ஊராட்சி எழுத்தர்</div></div></div>`;
}

function idProof(c: PattaCase) {
  return `<div class="sans" style="width:520px;margin:30px auto;border:2px solid #345;border-radius:14px;padding:18px 22px;background:linear-gradient(135deg,#f3f7fb,#e8eef6)">
    <div style="font-size:13px;color:#345;font-weight:600">அடையாள அட்டை · IDENTITY CARD · மாதிரி / SAMPLE</div>
    <div style="display:flex;gap:18px;margin-top:12px">
      <svg width="96" height="116" viewBox="0 0 96 116"><rect width="96" height="116" rx="8" fill="#cfd8e3"/><circle cx="48" cy="44" r="22" fill="#9aabbf"/><path d="M12 108c4-26 20-36 36-36s32 10 36 36" fill="#9aabbf"/></svg>
      <table style="font-size:15px;border:none;margin:0" class="kv">
        <tr><td style="border:none;padding:3px 8px 3px 0">பெயர்</td><td style="border:none;padding:3px 0"><b>${c.idProof.name}</b></td></tr>
        <tr><td style="border:none;padding:3px 8px 3px 0">த/பெ</td><td style="border:none;padding:3px 0">${c.buyer.parent}</td></tr>
        <tr><td style="border:none;padding:3px 8px 3px 0">பிறந்த நாள்</td><td style="border:none;padding:3px 0">${d(c.idProof.dob)}</td></tr>
        <tr><td style="border:none;padding:3px 8px 3px 0">எண்</td><td style="border:none;padding:3px 0;font-family:monospace">${c.idProof.number}</td></tr>
      </table>
    </div></div>`;
}

function petition(g: GrievanceCase) {
  const hand = g.petition.look === "handwritten";
  const body = g.petition.text;
  return `<div style="${hand ? "background:repeating-linear-gradient(#fffef6,#fffef6 33px,#c9d6ea 34px);" : ""}padding:6px 4px">
    <div class="${hand ? "hw" : "sans"}" style="${hand ? "font-size:21px;line-height:34px" : "font-size:16px;line-height:1.9"}">
      <div>அனுப்புநர்: ${g.applicant.ta}, ${g.village.ta}</div>
      <div>பெறுநர்: வட்டாட்சியர் அவர்கள், பொன்னேரி</div>
      <div>நாள்: ${d(g.submittedOn)}</div>
      <div style="margin-top:${hand ? 34 : 14}px">${body}</div>
      ${g.petition.location ? `<div style="margin-top:${hand ? 34 : 14}px">இடம்: ${g.petition.location}</div>` : ""}
      <div style="margin-top:${hand ? 34 : 18}px;text-align:right">இப்படிக்கு,<br>${g.applicant.ta}</div>
    </div></div>`;
}

// ---------------- looks ----------------

function wrap(inner: string, look: Look, opts: { stampLabel?: string } = {}) {
  let pre = "", open = "", close = "", extra = "", width = 780, height = 1100;
  if (look === "stamp_paper") {
    pre = `<div class="sans" style="border:3px double #2f6b3a;background:linear-gradient(#e8f3e4,#f6fbf2);padding:10px;text-align:center;color:#2f6b3a;margin-bottom:14px">
      <b>இந்திய அரசு · தமிழ்நாடு முத்திரைத்தாள்</b><br><span style="font-size:26px;font-weight:700">₹ 100</span> · நீதிமன்றம் சாரா முத்திரைத்தாள் · மாதிரி</div>
      <div style="position:absolute;top:250px;left:330px">${SEAL(opts.stampLabel ?? "சார் பதிவாளர் அலுவலகம்")}</div>
      <div style="position:absolute;top:520px;left:150px">${SEAL(opts.stampLabel ?? "சார் பதிவாளர் அலுவலகம்")}</div>`;
    extra = `.page{background:repeating-linear-gradient(45deg,#fbfdf6,#fbfdf6 12px,#f1f7ea 12px,#f1f7ea 24px)}`;
    height = 1200;
  }
  if (look === "phone_photo") {
    open = `<div style="width:1000px;height:1250px;background:radial-gradient(circle at 30% 20%,#8a6a4a,#4b3826);display:flex;align-items:center;justify-content:center;overflow:hidden">
      <div style="transform:perspective(1400px) rotateX(6deg) rotateY(-4deg) rotateZ(-3deg);box-shadow:0 30px 60px rgba(0,0,0,.55);filter:blur(0.7px) brightness(.94) contrast(.93)">`;
    close = `</div><div style="position:absolute;inset:0;background:linear-gradient(115deg,rgba(0,0,0,0) 35%,rgba(0,0,0,.25) 70%,rgba(0,0,0,.38))"></div></div>`;
    width = 1000; height = 1250;
  }
  if (look === "blurry") {
    open = `<div style="width:1000px;height:1250px;background:radial-gradient(circle at 60% 30%,#6d5a48,#2e241b);display:flex;align-items:center;justify-content:center;overflow:hidden">
      <div style="transform:rotateZ(4deg) scale(1.3);filter:blur(2.4px) brightness(.88) contrast(.8)">`;
    close = `</div></div>`;
    width = 1000; height = 1250;
  }
  if (look === "photocopy") {
    open = `<div style="position:relative;width:780px;filter:grayscale(1) contrast(1.8) brightness(1.08) blur(1px);transform:rotate(1deg);transform-origin:top left">`;
    close = `<div style="position:absolute;inset:0;background:${NOISE};opacity:.7;mix-blend-mode:multiply"></div>
      <div style="position:absolute;top:0;bottom:0;left:0;width:24px;background:linear-gradient(90deg,#222,rgba(0,0,0,0))"></div></div>`;
    extra = `.page{background:#e6e6e6} .page b{font-weight:400}`;
  }
  const html = `<!doctype html><html lang="ta"><head><meta charset="utf-8">${FONTS}<style>${CSS}${extra}</style></head>
    <body>${open}<div class="page"><div class="wm">மாதிரி / SAMPLE</div>${pre}${inner}${FICTION}</div>${close}</body></html>`;
  return { html, width, height };
}

function chrome(args: string[]) {
  execFileSync(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--virtual-time-budget=8000", ...args], { stdio: "ignore" });
}

function render(dir: string, kind: DocKind, look: Look, inner: string, opts: { stampLabel?: string; height?: number } = {}) {
  const { html, width, height } = wrap(inner, look, opts);
  const src = path.join(BUILD, `${path.basename(dir)}_${kind}.html`);
  writeFileSync(src, html);
  const ext = lookExt(look);
  const out = path.join(dir, `${kind}.${ext}`);
  const shot = (file: string) => chrome([`--window-size=${width},${opts.height ?? height}`, `--screenshot=${file}`, `file://${src}`]);
  if (look === "pdf") {
    chrome(["--no-pdf-header-footer", `--print-to-pdf=${out}`, `file://${src}`]);
    shot(path.join(dir, `${kind}.preview.png`));
  } else if (ext === "png") {
    shot(out);
  } else {
    const png = path.join(BUILD, `${path.basename(dir)}_${kind}.png`);
    shot(png);
    if (look === "photocopy") execFileSync("sips", ["--resampleWidth", "560", png, "--out", png], { stdio: "ignore" });
    execFileSync("sips", ["-s", "format", "jpeg", "-s", "formatOptions", look === "photocopy" ? "38" : "60", png, "--out", out], { stdio: "ignore" });
  }
  return path.relative(process.cwd(), out);
}

/**
 * Files an officer can add in the demo: the EC that PT-2026-0207's citizen brings later (turns the
 * case from "missing document" to clean), and a wrong document (ration card) for the Classify gate.
 */
function renderExtras() {
  mkdirSync(BUILD, { recursive: true });
  const c = PATTA_CASES.find((x) => x.ref === "PT-2026-0207")!;
  const later = path.join(OUT, c.ref, "_later");
  mkdirSync(later, { recursive: true });
  console.log(render(later, "ec", "pdf", ec(c)));
  const samples = path.join(OUT, "_samples");
  mkdirSync(samples, { recursive: true });
  const ration = `<div class="sans" style="border:3px solid #2a6;padding:24px;border-radius:10px"><h2 style="margin-top:0">தமிழ்நாடு அரசு – குடும்ப அட்டை (மாதிரி)</h2>
    <p>அட்டை எண்: 33XX-0000-4821</p><p>குடும்பத் தலைவர்: லட்சுமி</p><p>முகவரி: 12, பஜனைக் கோயில் தெரு, மீஞ்சூர்</p><p>உறுப்பினர்கள்: 4 · அட்டை வகை: PHH – அரிசி</p></div>`;
  const { html } = wrap(ration, "scan");
  const src = path.join(BUILD, "ration.html");
  writeFileSync(src, html);
  chrome([`--window-size=780,520`, `--screenshot=${path.join(samples, "ration_card.png")}`, `file://${src}`]);
  console.log("public/case-docs/_samples/ration_card.png");
  rmSync(BUILD, { recursive: true, force: true });
}

/**
 * Document sets the presenter uploads as the citizen in the live demo: one folder and one .zip per kit,
 * plus kit B's receipt after paying the dues (uploaded when the tahsildar returns the file).
 * Rendered separately so the seeded cases' files (and their paid readings) never change.
 */
const KIT_NAMES: Record<string, string> = { sale_deed: "1-sale-deed", patta: "2-patta", ec: "3-encumbrance-certificate", tax_receipt: "4-tax-receipt", id_proof: "5-id-card" };
function renderKits() {
  const root = path.resolve(__dirname, "../public/demo-kits");
  rmSync(root, { recursive: true, force: true });
  mkdirSync(BUILD, { recursive: true });
  const fit: Partial<Record<DocKind, number>> = { id_proof: 420, tax_receipt: 700, patta: 520, ec: 600 };
  for (const k of DEMO_KITS) {
    const tmp = path.join(BUILD, k.id);
    mkdirSync(tmp, { recursive: true });
    const bodies: Partial<Record<DocKind, () => string>> = {
      sale_deed: () => saleDeed(k, k.docs.sale_deed!), patta: () => patta(k), ec: () => ec(k), tax_receipt: () => taxReceipt(k), id_proof: () => idProof(k),
    };
    const dir = path.join(root, k.id);
    mkdirSync(dir, { recursive: true });
    for (const [kind, look] of Object.entries(k.docs) as [DocKind, Look][]) {
      render(tmp, kind, look, bodies[kind]!(), { stampLabel: k.sro.ta, height: look === "phone_photo" || look === "blurry" ? undefined : fit[kind] });
      const ext = lookExt(look);
      copyFileSync(path.join(tmp, `${kind}.${ext}`), path.join(dir, `${KIT_NAMES[kind]}.${ext}`));
    }
    execFileSync("zip", ["-jq", path.join(root, `${k.id}.zip`), ...readdirSync(dir).map((f) => path.join(dir, f))]);
    console.log(`public/demo-kits/${k.id}.zip`);
    if (k.taxLater) {
      const paid = { ...k, tax: k.taxLater };
      render(tmp, "tax_receipt", "scan", taxReceipt(paid), { height: fit.tax_receipt });
      copyFileSync(path.join(tmp, "tax_receipt.png"), path.join(root, `${k.id}-tax-receipt-paid.png`));
      console.log(`public/demo-kits/${k.id}-tax-receipt-paid.png`);
    }
  }
  rmSync(BUILD, { recursive: true, force: true });
}

function main() {
  if (!existsSync(CHROME)) throw new Error(`Chrome not found at ${CHROME}; set CHROME_PATH`);
  if (process.argv.includes("--extras-only")) return renderExtras();
  if (process.argv.includes("--kits")) return renderKits();
  rmSync(OUT, { recursive: true, force: true });
  rmSync(BUILD, { recursive: true, force: true });
  mkdirSync(BUILD, { recursive: true });

  for (const c of PATTA_CASES) {
    const dir = path.join(OUT, c.ref);
    mkdirSync(dir, { recursive: true });
    const bodies: Record<Exclude<DocKind, "petition">, () => string> = {
      application_form: () => applicationForm(c),
      sale_deed: () => saleDeed(c, c.docs.sale_deed!),
      patta: () => patta(c),
      ec: () => ec(c),
      tax_receipt: () => taxReceipt(c),
      id_proof: () => idProof(c),
    };
    for (const [kind, look] of Object.entries(c.docs) as [Exclude<DocKind, "petition">, Look][]) {
      // Fit the image to the content so the viewer isn't half empty paper.
      const fit: Partial<Record<DocKind, number>> = { id_proof: 420, tax_receipt: 700, patta: 520, ec: 600, application_form: 1000 };
      const h = look === "stamp_paper" ? undefined : fit[kind];
      console.log(render(dir, kind, look, bodies[kind](), { stampLabel: c.sro.ta, height: look === "phone_photo" ? undefined : h }));
    }
  }
  for (const g of GRIEVANCE_CASES) {
    const dir = path.join(OUT, g.ref);
    mkdirSync(dir, { recursive: true });
    console.log(render(dir, "petition", g.petition.look, petition(g), { height: g.petition.text.length > 120 ? 620 : 480 }));
  }
  rmSync(BUILD, { recursive: true, force: true });
  renderExtras();
  renderKits();
}

main();
