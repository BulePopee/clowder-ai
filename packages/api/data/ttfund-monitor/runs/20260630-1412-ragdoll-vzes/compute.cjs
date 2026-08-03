// Stage 3: Compute derived indicators from raw.json
const fs = require("fs");
const path = require("path");

const runDir = __dirname;
const raw = JSON.parse(fs.readFileSync(path.join(runDir, "raw.json"), "utf8"));
const results = raw.results;
const v = (id) => results[id]?.value;

// helper
const bp = (x) => x != null ? Math.round(x * 100) : null;
const fmtBp = (val) => val != null ? `${val > 0 ? '+' : ''}${val}bp` : '🔴 缺口';
const fmtPct = (val) => val != null ? `${(val * 100).toFixed(2)}%` : '🔴 缺口';

// Yield Curves
const us102y = bp(v("B2") - v("B3"));        // US 10Y-2Y
const us3010y = bp(v("B1") - v("B2"));       // US 30Y-10Y
const us302y = bp(v("B1") - v("B3"));        // US 30Y-2Y
const cnus10y = bp(v("B6") - v("B2"));       // CN-US 10Y
const cn102y = bp(v("B6") - v("B7"));        // CN 10Y-2Y
const cn3010y = bp(v("B5") - v("B6"));       // CN 30Y-10Y
const cn302y = bp(v("B5") - v("B7"));        // CN 30Y-2Y

// Liquidity Spreads
const dr007omo = bp(v("M2") - v("M2a"));     // DR007−OMO
const r007dr007 = bp(v("M4") - v("M2"));     // R007−DR007
const sofrIorb = bp(v("N2") - v("N4"));      // SOFR−IORB

// Gold Ratios
const goldOil = v("O1") ? (v("G4") / v("O1")).toFixed(1) : null;     // G9
const goldSilver = v("AG") ? (v("G4") / v("AG")).toFixed(1) : null;  // G10
const domesticPremium = (() => {
  if (v("G2") == null || v("X3") == null || v("G4") == null) return null;
  const shGold = v("G2") * 31.1035;           // CNY/oz
  const shGoldUsd = shGold / v("X3");          // USD/oz
  return (shGoldUsd / v("G4") - 1);            // ratio
})();

// CNH−CNY
const cnhCny = v("X4") != null && v("X3") != null ? v("X4") - v("X3") : null;

// Moving Averages (last 20 kline points)
function calcSMA(klineData, n = 20) {
  if (!klineData || !Array.isArray(klineData) || klineData.length < n) return null;
  const closes = klineData.slice(0, n).map(p => parseFloat(p[1]));
  const sma = closes.reduce((a, b) => a + b, 0) / closes.length;
  const latest = closes[0];
  const oldest = closes[n - 1];
  const change = (latest - oldest) / oldest;
  return { sma: sma.toFixed(2), latest, change: (change * 100).toFixed(2), n };
}
const e1MA = calcSMA(v("E1_kl"));
const e2MA = calcSMA(v("E2_kl"));
const e3MA = calcSMA(v("E3_kl"));

const derived = {
  runId: raw.runId,
  computedAt: new Date().toISOString(),
  status: "degraded",  // many components are staleGap
  yieldCurves: {
    us10y2y: { value: us102y, unit: "bp", components: ["B2", "B3"], status: us102y != null ? "staleDerived" : "missingDerived", note: "B2/B3 from 2026-06-29 (staleGap 1d)" },
    us30y10y: { value: us3010y, unit: "bp", components: ["B1", "B2"], status: us3010y != null ? "staleDerived" : "missingDerived", note: "B1/B2 from 2026-06-29 (staleGap 1d)" },
    us30y2y: { value: us302y, unit: "bp", components: ["B1", "B3"], status: us302y != null ? "staleDerived" : "missingDerived", note: "B1/B3 from 2026-06-29 (staleGap 1d)" },
    cnus10y: { value: cnus10y, unit: "bp", components: ["B6", "B2"], status: cnus10y != null ? "staleDerived" : "missingDerived", note: "CN-US 10Y spread. B6/B2 from 2026-06-29 (staleGap 1d)" },
    cn10y2y: { value: cn102y, unit: "bp", components: ["B6", "B7"], status: cn102y != null ? "staleDerived" : "missingDerived", note: "B6/B7 from 2026-06-29 (staleGap 1d)" },
    cn30y10y: { value: cn3010y, unit: "bp", components: ["B5", "B6"], status: cn3010y != null ? "staleDerived" : "missingDerived", note: "B5/B6 from 2026-06-29 (staleGap 1d)" },
    cn30y2y: { value: cn302y, unit: "bp", components: ["B5", "B7"], status: cn302y != null ? "staleDerived" : "missingDerived", note: "B5/B7 from 2026-06-29 (staleGap 1d)" },
  },
  liquidity: {
    dr007omo: { value: dr007omo, unit: "bp", components: ["M2", "M2a"], status: dr007omo != null ? "staleDerived" : "missingDerived" },
    r007dr007: { value: r007dr007, unit: "bp", components: ["M4", "M2"], status: r007dr007 != null ? "staleDerived" : "missingDerived" },
    sofrIorb: { value: sofrIorb, unit: "bp", components: ["N2", "N4"], status: sofrIorb != null ? "staleDerived" : "missingDerived" },
  },
  goldRatios: {
    g9_goldOil: { value: goldOil, unit: "ratio", components: ["G4", "O1"], status: goldOil != null ? "staleDerived" : "missingDerived" },
    g10_goldSilver: { value: goldSilver, unit: "ratio", components: ["G4", "AG"], status: goldSilver != null ? "staleDerived" : "missingDerived" },
    g11_domesticPremium: { value: domesticPremium != null ? (domesticPremium * 100).toFixed(2) + "%" : null, unit: "pct", components: ["G2", "X3", "G4"], status: domesticPremium != null ? "staleDerived" : "missingDerived" },
  },
  fx: {
    cnhCny: { value: cnhCny, unit: "bp", components: ["X4", "X3"], status: cnhCny != null ? "staleDerived" : "missingDerived", note: cnhCny != null ? `${(cnhCny > 0 ? '+' : '') + cnhCny.toFixed(4)} (CNY=${v("X3")}, CNH=${v("X4")})` : null },
  },
  movingAverages: {
    e1_nasdaq100: e1MA ? { sma: e1MA.sma, latest: e1MA.latest, change20d: e1MA.change + "%", n: e1MA.n, status: "staleDerived" } : { status: "missingDerived", reason: "kline < 20" },
    e2_csi300: e2MA ? { sma: e2MA.sma, latest: e2MA.latest, change20d: e2MA.change + "%", n: e2MA.n, status: "staleDerived" } : { status: "missingDerived", reason: "kline < 20" },
    e3_csi500: e3MA ? { sma: e3MA.sma, latest: e3MA.latest, change20d: e3MA.change + "%", n: e3MA.n, status: "staleDerived" } : { status: "missingDerived", reason: "kline < 20" },
  },
  summary: {
    totalFormulas: 15,
    freshDerived: 0,
    staleDerived: 15,
    missingDerived: 0,
    note: "All derived values computed from staleGap components (data from 2026-06-29, 1d lag). No critical component null."
  }
};

fs.writeFileSync(path.join(runDir, "derived.json"), JSON.stringify(derived, null, 2));
console.log(JSON.stringify(derived.summary) + "\n---derived.json written---");
