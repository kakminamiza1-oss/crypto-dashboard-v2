// Verify RSI + Supertrend bug vs fix in actual JS (same as dashboard language)
const FAPI = "https://fapi.binance.com";

async function klines(sym, tf, limit = 300) {
  const r = await fetch(`${FAPI}/fapi/v1/klines?symbol=${sym}&interval=${tf}&limit=${limit}`);
  const d = await r.json();
  return { h: d.map(k => +k[2]), l: d.map(k => +k[3]), c: d.map(k => +k[4]) };
}

function ema(v, n) { let k = 2 / (n + 1), e = v[0], o = [e]; for (let i = 1; i < v.length; i++) { e = v[i] * k + e * (1 - k); o.push(e); } return o; }
function rma(v, n) { let a = 1 / n, e = v[0], o = [e]; for (let i = 1; i < v.length; i++) { e = v[i] * a + e * (1 - a); o.push(e); } return o; }

// BUGGY RSI (copied verbatim from dashboard index.html line 125)
function rsi_buggy(c, n = 14) {
  let g = [], l = [];
  for (let i = 1; i < c.length; i++) { let d = c[i] - c[i - 1]; g.push(d > 0 ? d : 0); l.push(d < 0 ? -d : 0); }
  if (g.length < n) return [50];
  let ag = rma(g, n), al = rma(l, n);
  return c.map((_, i) => {
    if (i < n) return 50;
    let rs = al[i] ? ag[i] / al[i] : 99;   // <-- al/ag len = c.len-1, so al[c.len-1] = undefined -> 99
    return 100 - 100 / (1 + rs);
  });
}

// FIXED RSI
function rsi_fixed(c, n = 14) {
  let g = [], l = [];
  for (let i = 1; i < c.length; i++) { let d = c[i] - c[i - 1]; g.push(d > 0 ? d : 0); l.push(d < 0 ? -d : 0); }
  if (g.length < n) return [50];
  let ag = rma(g, n), al = rma(l, n);
  return c.map((_, i) => {
    if (i < n) return 50;
    let j = i - 1;
    let rs = al[j] ? ag[j] / al[j] : 99;
    return 100 - 100 / (1 + rs);
  });
}

// BUGGY supertrend (copied — TR uses c[i-1] at i=0 -> c[-1]=NaN)
function st_buggy(h, l, c, len = 10, mult = 3) {
  let atrS = rma(h.map((x, i) => (i === 0 ? (x - l[i]) : Math.max(x - l[i], Math.abs(x - c[i - 1]), Math.abs(l[i] - c[i - 1])))), len);
  let up = [], dn = [], st = [], dir = 1;
  for (let i = 0; i < c.length; i++) {
    let mid = (h[i] + l[i]) / 2, ub = mid + mult * atrS[i], lb = mid - mult * atrS[i];
    if (i === 0) { up.push(ub); dn.push(lb); st.push(ub); continue; }
    up.push(Math.max(ub, up[i - 1])); dn.push(Math.min(lb, dn[i - 1]));
    if (c[i] > up[i - 1]) dir = 1; else if (c[i] < dn[i - 1]) dir = -1;
    st.push(dir === 1 ? dn[i] : up[i]);
  }
  let lastDir = c.map((_, i) => i === 0 ? 1 : (c[i] > up[i - 1] ? 1 : c[i] < dn[i - 1] ? -1 : st[i - 1] >= up[i - 1] ? 1 : -1));
  return lastDir.at(-1);
}

// FIXED supertrend (TR[0] = h[0]-l[0])
function st_fixed(h, l, c, len = 10, mult = 3) {
  let tr = [h[0] - l[0]];
  for (let i = 1; i < c.length; i++) tr.push(Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1])));
  let atrS = rma(tr, len);
  let up = [], dn = [], st = [], dir = 1;
  for (let i = 0; i < c.length; i++) {
    let mid = (h[i] + l[i]) / 2, ub = mid + mult * atrS[i], lb = mid - mult * atrS[i];
    if (i === 0) { up.push(ub); dn.push(lb); st.push(ub); continue; }
    up.push(Math.max(ub, up[i - 1])); dn.push(Math.min(lb, dn[i - 1]));
    if (c[i] > up[i - 1]) dir = 1; else if (c[i] < dn[i - 1]) dir = -1;
    st.push(dir === 1 ? dn[i] : up[i]);
  }
  let lastDir = c.map((_, i) => i === 0 ? 1 : (c[i] > up[i - 1] ? 1 : c[i] < dn[i - 1] ? -1 : st[i - 1] >= up[i - 1] ? 1 : -1));
  return lastDir.at(-1);
}

console.log("=== JS REAL BINANCE: RSI/ST bug vs fix ===");
for (const sym of ["BTCUSDT", "ETHUSDT", "XAUUSDT"]) {
  const k = await klines(sym, "1h", 300);
  const rb = rsi_buggy(k.c), rf = rsi_fixed(k.c);
  const sb = st_buggy(k.h, k.l, k.c), sf = st_fixed(k.h, k.l, k.c);
  console.log(`\n${sym}  close=${k.c.at(-1)}`);
  console.log(`  RSI  buggy=${rb.at(-1).toFixed(1)}   fixed=${rf.at(-1).toFixed(1)}`);
  console.log(`  ST   buggy=${sb === 1 ? 'BULL ▲' : 'BEAR ▼'}   fixed=${sf === 1 ? 'BULL ▲' : 'BEAR ▼'}`);
}
