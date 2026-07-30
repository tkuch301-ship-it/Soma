"use strict";

/* ============================================================
 * Soma — 面接トーク練習アプリ
 * すべてクライアントサイドで動作。録音音声は保存せず、
 * 文字起こしと統計のみを localStorage に記録する。
 * ============================================================ */

/* ---------- 質問データ ---------- */
const QUESTIONS = [
  { id: "self-intro",  text: "自己紹介をお願いします。",                       defaultTarget: 60 },
  { id: "gakuchika",   text: "学生時代に力を入れたことを教えてください。",     defaultTarget: 90 },
  { id: "motivation",  text: "当社を志望する理由を教えてください。",           defaultTarget: 60 },
  { id: "strength",    text: "あなたの強みを教えてください。",                 defaultTarget: 60 },
  { id: "weakness",    text: "あなたの弱みを教えてください。",                 defaultTarget: 60 },
  { id: "failure",     text: "挫折した経験と、そこから学んだことを教えてください。", defaultTarget: 90 },
  { id: "teamwork",    text: "チームで成果を出した経験を教えてください。",     defaultTarget: 90 },
  { id: "vision",      text: "入社後にやりたいことを教えてください。",         defaultTarget: 60 },
  { id: "one-minute",  text: "1分間で自己PRをしてください。",                  defaultTarget: 60 },
];

const TARGET_OPTIONS = [30, 60, 90, 120];

/* ---------- 検出パターン ---------- */
// フィラー語(言いよどみ)。音声認識に残りやすい表記を中心に。
const FILLERS = [
  "えーと", "えっと", "ええと", "えー", "あのー", "あのう", "あの",
  "そのー", "その、", "んーと", "うーん", "まあ", "まぁ", "なんか",
  "こう、", "やっぱり", "やっぱ", "とりあえず",
];
// 冗長表現。削っても意味が変わらない言い回し。
const REDUNDANTS = [
  "という形で", "というふうに", "という風に", "といったような",
  "させていただき", "させていただく", "させていただいて",
  "だと思っていて", "かなと思って", "かなというふうに",
  "個人的には", "どちらかというと", "逆に言うと", "のような形",
  "することができ", "ということなんですけど", "なんですけれども",
];

/* ---------- 状態 ---------- */
const state = {
  questionId: QUESTIONS[0].id,
  target: QUESTIONS[0].defaultTarget,
  recording: false,
  startTime: 0,
  timerHandle: null,
  segments: [],      // 確定した認識結果(発話のまとまりごと)
  interim: "",
  recognition: null,
  lastResult: null,
};

const HISTORY_KEY = "soma-history-v1";

/* ---------- ユーティリティ ---------- */
const $ = (id) => document.getElementById(id);

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function questionById(id) {
  return QUESTIONS.find((q) => q.id === id) || QUESTIONS[0];
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// フィラーと冗長表現を1回のスキャンで検出する。
// 長いパターンを優先し、重なった検出は数えない
// (「あのー」を「あの」と二重に数えない / 「やっぱり」を「やっぱ」と二重に数えない)。
function findPatterns(text) {
  const patterns = [
    ...FILLERS.map((p) => ({ p, cls: "filler" })),
    ...REDUNDANTS.map((p) => ({ p, cls: "redundant" })),
  ].sort((a, b) => b.p.length - a.p.length);

  const spans = [];
  let i = 0;
  while (i < text.length) {
    let hit = null;
    for (const { p, cls } of patterns) {
      if (text.startsWith(p, i)) { hit = { start: i, end: i + p.length, cls }; break; }
    }
    if (hit) {
      spans.push(hit);
      i = hit.end;
    } else {
      i++;
    }
  }
  return spans;
}

/* ---------- 画面切り替え ---------- */
function showScreen(name) {
  document.querySelectorAll(".screen").forEach((el) => el.classList.remove("active"));
  $(`screen-${name}`).classList.add("active");
  document.querySelectorAll(".tab").forEach((el) => {
    el.classList.toggle("active", el.dataset.screen === name);
  });
  if (name === "history") renderHistory();
}

/* ---------- ホーム画面 ---------- */
function initHome() {
  const select = $("question-select");
  select.innerHTML = QUESTIONS.map(
    (q) => `<option value="${q.id}">${q.text}</option>`
  ).join("");
  select.addEventListener("change", () => {
    state.questionId = select.value;
    setTarget(questionById(state.questionId).defaultTarget);
  });

  const wrap = $("target-buttons");
  wrap.innerHTML = TARGET_OPTIONS.map(
    (t) => `<button type="button" data-target="${t}">${t}秒</button>`
  ).join("");
  wrap.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-target]");
    if (btn) setTarget(Number(btn.dataset.target));
  });
  setTarget(state.target);

  $("btn-start").addEventListener("click", () => {
    $("practice-question").textContent = questionById(state.questionId).text;
    $("timer-target-label").textContent = formatTime(state.target);
    resetPracticeUI();
    showScreen("practice");
  });

  if (!getSpeechRecognition()) {
    $("sr-warning").classList.remove("hidden");
    $("btn-start").disabled = true;
  }
}

function setTarget(t) {
  state.target = t;
  document.querySelectorAll("#target-buttons button").forEach((b) => {
    b.classList.toggle("selected", Number(b.dataset.target) === t);
  });
}

/* ---------- 録音と音声認識 ---------- */
function getSpeechRecognition() {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function resetPracticeUI() {
  $("timer-display").textContent = "0:00";
  $("timer-display").classList.remove("over");
  $("timer-bar-fill").style.width = "0%";
  $("timer-bar-fill").classList.remove("over");
  $("transcript-live").textContent = "";
  $("btn-record").classList.remove("hidden");
  $("btn-stop").classList.add("hidden");
}

function startRecording() {
  const SR = getSpeechRecognition();
  if (!SR) return;

  state.segments = [];
  state.interim = "";
  state.recording = true;
  state.startTime = Date.now();

  const rec = new SR();
  rec.lang = "ja-JP";
  rec.continuous = true;
  rec.interimResults = true;

  rec.onresult = (event) => {
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const r = event.results[i];
      if (r.isFinal) {
        const text = r[0].transcript.trim();
        if (text) state.segments.push(text);
      } else {
        interim += r[0].transcript;
      }
    }
    state.interim = interim;
    renderLiveTranscript();
  };

  // Chrome は無音が続くと勝手に止まるので、録音中は再開する
  rec.onend = () => {
    if (state.recording) {
      try { rec.start(); } catch (_) { /* 連続startは無視 */ }
    }
  };
  rec.onerror = (event) => {
    if (event.error === "not-allowed" || event.error === "service-not-allowed") {
      state.recording = false;
      alert("マイクの使用が許可されていません。ブラウザの設定でマイクを許可してください。");
      resetPracticeUI();
    }
  };

  state.recognition = rec;
  rec.start();

  $("btn-record").classList.add("hidden");
  $("btn-stop").classList.remove("hidden");
  state.timerHandle = setInterval(updateTimer, 200);
}

function renderLiveTranscript() {
  const text = state.segments.join(" ") + (state.interim ? " " + state.interim : "");
  const el = $("transcript-live");
  el.textContent = text;
  el.scrollTop = el.scrollHeight;
}

function updateTimer() {
  const elapsed = (Date.now() - state.startTime) / 1000;
  $("timer-display").textContent = formatTime(elapsed);
  const pct = Math.min((elapsed / state.target) * 100, 100);
  $("timer-bar-fill").style.width = `${pct}%`;
  const over = elapsed > state.target;
  $("timer-display").classList.toggle("over", over);
  $("timer-bar-fill").classList.toggle("over", over);
}

function stopRecording() {
  if (!state.recording) return;
  state.recording = false;
  clearInterval(state.timerHandle);
  const duration = (Date.now() - state.startTime) / 1000;
  if (state.recognition) {
    try { state.recognition.stop(); } catch (_) {}
  }

  // 認識結果の確定を少し待ってから分析する
  setTimeout(() => {
    if (state.interim.trim()) {
      state.segments.push(state.interim.trim());
      state.interim = "";
    }
    finishAttempt(duration);
  }, 600);
}

function cancelPractice() {
  state.recording = false;
  clearInterval(state.timerHandle);
  if (state.recognition) {
    try { state.recognition.stop(); } catch (_) {}
  }
  resetPracticeUI();
  showScreen("home");
}

/* ---------- 分析と採点 ---------- */
const MIN_CHARS = 12; // これ未満は認識失敗とみなして採点しない

function analyze(segments, duration, target) {
  const transcript = segments.join("。");
  const chars = transcript.replace(/[\s。、．，,.]/g, "").length;
  const minutes = Math.max(duration / 60, 1 / 60);
  const rate = Math.round(chars / minutes); // 字/分

  // ほとんど認識できていないときは採点そのものが無意味なので、
  // 高得点を出さずに「認識できなかった」ことを伝える。
  if (chars < MIN_CHARS) {
    return {
      noSpeech: true, transcript, chars, rate: 0,
      fillerCount: 0, fillerPerMin: 0, redundantCount: 0, avgSentence: 0,
      spans: [], duration, target, overRatio: duration / target,
      score: null, grade: "–",
      advice: [
        "音声をほとんど認識できませんでした。マイクの許可を確認し、マイクに近づいてはっきり話してみてください。",
        "静かな場所で、Chrome または Edge を使うと認識精度が上がります。",
      ],
    };
  }

  const spans = findPatterns(transcript);
  const fillerCount = spans.filter((s) => s.cls === "filler").length;
  const redundantCount = spans.filter((s) => s.cls === "redundant").length;
  const fillerPerMin = fillerCount / minutes;

  // 文の長さ:句点があれば句点で、なければ認識セグメントで区切る
  let sentences = transcript.split(/[。!?!?]/).map((s) => s.trim()).filter(Boolean);
  if (sentences.length <= 1 && segments.length > 1) sentences = segments;
  const avgSentence = sentences.length
    ? Math.round(sentences.reduce((a, s) => a + s.length, 0) / sentences.length)
    : 0;

  const overRatio = duration / target; // 1.0 = ぴったり

  /* 採点(100点満点から減点) */
  let score = 100;
  const advice = [];

  // 時間
  if (overRatio > 1.0) {
    const overPct = (overRatio - 1) * 100;
    score -= Math.min(Math.round(overPct / 10) * 5, 40);
    if (overPct >= 50) {
      advice.push(`目標を${Math.round(overPct)}%超過しています。まず結論を10秒で言い切り、理由と具体例を1つずつに絞りましょう。`);
    } else if (overPct >= 10) {
      advice.push(`目標を${Math.round(overPct)}%超過しました。具体例を1つ削るだけで収まる長さです。`);
    }
  } else if (overRatio < 0.4) {
    score -= 10;
    advice.push("目標時間に対してかなり短めです。結論のあとに理由か具体例を1つ足すと説得力が出ます。");
  }

  // フィラー(聞き手が気になり始めるのは1分あたり3回あたりから)
  if (fillerPerMin > 6) {
    score -= 20;
    advice.push(`フィラー語が1分あたり${fillerPerMin.toFixed(1)}回とかなり多めです。「えーと」と言いそうになったら黙って1拍おく練習をしましょう。沈黙はフィラーより印象が良いです。`);
  } else if (fillerPerMin > 3) {
    score -= 12;
    advice.push(`フィラー語がやや多め(1分あたり${fillerPerMin.toFixed(1)}回)です。文の切れ目で一呼吸おく意識を持つと減らせます。`);
  } else if (fillerPerMin > 1.5) {
    score -= 5;
  }

  // 冗長表現
  if (redundantCount >= 4) {
    score -= 10;
    advice.push("「〜という形で」「〜だと思っていて」などの冗長表現が目立ちます。言い切る形(「〜です」「〜しました」)に置き換えると引き締まります。");
  } else if (redundantCount >= 2) {
    score -= 5;
    advice.push("冗長表現がいくつかあります。ハイライトされた箇所を短い言い切りに変えられないか確認しましょう。");
  }

  // 一文の長さ
  if (avgSentence > 80) {
    score -= 10;
    advice.push(`一文が平均${avgSentence}文字と長すぎます。一文一義(1文に情報は1つ)を意識して、60文字以内で区切りましょう。`);
  } else if (avgSentence > 60) {
    score -= 5;
    advice.push(`一文がやや長め(平均${avgSentence}文字)です。「〜で、〜で、」と続けず、いったん「。」で切る癖をつけましょう。`);
  }

  // 話速(日本語の聞き取りやすい速度はおおよそ250〜350字/分)
  if (chars > 20) {
    if (rate > 450) {
      score -= 10;
      advice.push(`話速が${rate}字/分とかなり速めです。焦って詰め込むより、内容を減らしてゆっくり話すほうが伝わります。`);
    } else if (rate > 400) {
      score -= 5;
      advice.push(`話速がやや速め(${rate}字/分)です。大事な単語の前で半拍おくと聞き取りやすくなります。`);
    } else if (rate < 200 && overRatio > 1.0) {
      advice.push("話速は落ち着いていますが、その分時間を使っています。内容を絞れば目標内に収まります。");
    }
  }

  score = Math.max(0, Math.min(100, score));

  if (advice.length === 0) {
    advice.push("時間・話速・言いよどみのバランスが良い回答です。この感覚を体に覚えさせるため、別の質問でも試してみましょう。");
  }

  const grade = score >= 90 ? "S" : score >= 80 ? "A" : score >= 70 ? "B" : score >= 60 ? "C" : "D";

  return {
    noSpeech: false, transcript, chars, rate, fillerCount, fillerPerMin,
    redundantCount, avgSentence, spans, duration, target, overRatio,
    score, grade, advice,
  };
}

/* ---------- 結果画面 ---------- */
function finishAttempt(duration) {
  const result = analyze(state.segments, duration, state.target);
  state.lastResult = result;
  // 認識できなかった回は記録に残さない(履歴のグラフが汚れるため)
  if (!result.noSpeech) saveHistory(result);
  renderResult(result);
  showScreen("result");
}

function renderResult(r) {
  $("result-score").textContent = r.noSpeech ? "–" : r.score;
  $("result-grade").textContent = r.noSpeech ? "採点できません" : `評価 ${r.grade}`;

  if (r.noSpeech) {
    $("result-summary").innerHTML =
      `<strong>音声を認識できませんでした。</strong>この回は記録に残していません。`;
    $("result-metrics").innerHTML = "";
    $("result-advice").innerHTML = r.advice.map((a) => `<li>${escapeHtml(a)}</li>`).join("");
    $("result-transcript").innerHTML = highlightTranscript(r);
    return;
  }

  const overPct = Math.round((r.overRatio - 1) * 100);
  let summary;
  if (r.overRatio > 1.1) {
    summary = `目標${formatTime(r.target)}に対して<strong>${formatTime(r.duration)}(${overPct}%超過)</strong>でした。`;
  } else if (r.overRatio >= 0.7) {
    summary = `目標${formatTime(r.target)}に対して<strong>${formatTime(r.duration)}</strong>。時間はほぼぴったりです。`;
  } else {
    summary = `目標${formatTime(r.target)}に対して<strong>${formatTime(r.duration)}</strong>と短めでした。`;
  }
  $("result-summary").innerHTML = summary;

  const metric = (label, value, note, cls = "") =>
    `<div class="metric ${cls}">
       <div class="m-label">${label}</div>
       <div class="m-value">${value}</div>
       <div class="m-note">${note}</div>
     </div>`;

  const timeCls = r.overRatio > 1.3 ? "bad" : r.overRatio <= 1.1 && r.overRatio >= 0.4 ? "ok" : "";
  const fillerCls = r.fillerPerMin > 5 ? "bad" : r.fillerPerMin <= 2 ? "ok" : "";
  const rateCls = r.rate > 450 ? "bad" : r.rate >= 250 && r.rate <= 350 ? "ok" : "";
  const sentCls = r.avgSentence > 80 ? "bad" : r.avgSentence > 0 && r.avgSentence <= 60 ? "ok" : "";

  $("result-metrics").innerHTML = [
    metric("話した時間", formatTime(r.duration), `目標 ${formatTime(r.target)}`, timeCls),
    metric("話速", `${r.rate}字/分`, "目安 250〜350", rateCls),
    metric("フィラー語", `${r.fillerCount}回`, `1分あたり${r.fillerPerMin.toFixed(1)}回`, fillerCls),
    metric("冗長表現", `${r.redundantCount}回`, "「〜という形で」など"),
    metric("一文の長さ", `${r.avgSentence}文字`, "目安 60文字以内", sentCls),
    metric("文字数", `${r.chars}文字`, "句読点を除く"),
  ].join("");

  $("result-advice").innerHTML = r.advice.map((a) => `<li>${escapeHtml(a)}</li>`).join("");
  $("result-transcript").innerHTML = highlightTranscript(r);
}

// analyze が返した span をそのまま使うので、カウントとハイライトが必ず一致する
function highlightTranscript(r) {
  const text = r.transcript;
  if (!text.trim()) {
    return '<span class="hint">(音声を認識できませんでした)</span>';
  }
  let html = "";
  let pos = 0;
  for (const s of r.spans) {
    html += escapeHtml(text.slice(pos, s.start));
    html += `<mark class="${s.cls}">${escapeHtml(text.slice(s.start, s.end))}</mark>`;
    pos = s.end;
  }
  html += escapeHtml(text.slice(pos));
  return html;
}

/* ---------- 履歴 ---------- */
function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
  } catch (_) {
    return [];
  }
}

function saveHistory(r) {
  const history = loadHistory();
  history.push({
    date: new Date().toISOString(),
    questionId: state.questionId,
    duration: Math.round(r.duration),
    target: r.target,
    fillerCount: r.fillerCount,
    score: r.score,
  });
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

function renderHistory() {
  const history = loadHistory();
  const empty = history.length === 0;
  $("history-empty").classList.toggle("hidden", !empty);
  $("history-content").classList.toggle("hidden", empty);
  if (empty) return;

  renderChart(history);

  const tbody = $("history-table").querySelector("tbody");
  tbody.innerHTML = history
    .slice()
    .reverse()
    .map((h) => {
      const d = new Date(h.date);
      const dateStr = `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
      const q = questionById(h.questionId).text;
      const qShort = q.length > 14 ? q.slice(0, 14) + "…" : q;
      return `<tr>
        <td class="num">${dateStr}</td>
        <td>${escapeHtml(qShort)}</td>
        <td class="num">${formatTime(h.duration)}</td>
        <td class="num">${formatTime(h.target)}</td>
        <td class="num">${h.fillerCount}回</td>
        <td class="num">${h.score}</td>
      </tr>`;
    })
    .join("");
}

/* スコア推移の折れ線チャート(単一系列なので凡例なし、タイトルが系列名を兼ねる) */
function renderChart(history) {
  const container = $("history-chart");
  const tooltip = $("chart-tooltip");
  const data = history.slice(-30); // 直近30回

  const W = Math.max(container.clientWidth || 640, 320);
  const H = 220;
  const pad = { top: 12, right: 16, bottom: 28, left: 36 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;

  const n = data.length;
  const x = (i) => pad.left + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (score) => pad.top + (1 - score / 100) * plotH;

  const css = getComputedStyle(document.documentElement);
  const cSeries = css.getPropertyValue("--series-1").trim();
  const cGrid = css.getPropertyValue("--grid").trim();
  const cBase = css.getPropertyValue("--baseline").trim();
  const cMuted = css.getPropertyValue("--muted").trim();
  const cSurface = css.getPropertyValue("--surface").trim();

  let svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="スコアの推移">`;

  // 横グリッド(控えめなヘアライン)と目盛りラベル
  for (const v of [0, 25, 50, 75, 100]) {
    const gy = y(v);
    svg += `<line x1="${pad.left}" y1="${gy}" x2="${W - pad.right}" y2="${gy}" stroke="${v === 0 ? cBase : cGrid}" stroke-width="1"/>`;
    svg += `<text x="${pad.left - 8}" y="${gy + 4}" text-anchor="end" font-size="11" fill="${cMuted}" style="font-variant-numeric:tabular-nums">${v}</text>`;
  }

  // 折れ線(2px)
  if (n > 1) {
    const points = data.map((d, i) => `${x(i)},${y(d.score)}`).join(" ");
    svg += `<polyline points="${points}" fill="none" stroke="${cSeries}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
  }

  // マーカー(8px = 半径4、サーフェス色の2pxリングで重なりを分離)
  data.forEach((d, i) => {
    svg += `<circle cx="${x(i)}" cy="${y(d.score)}" r="4" fill="${cSeries}" stroke="${cSurface}" stroke-width="2"/>`;
  });

  // 最新値のみ直接ラベル(全点に数字を付けない)
  if (n > 0) {
    const last = data[n - 1];
    const lx = Math.min(x(n - 1), W - pad.right - 4);
    svg += `<text x="${lx}" y="${y(last.score) - 10}" text-anchor="middle" font-size="12" font-weight="600" fill="${cMuted}">${last.score}</text>`;
  }

  // X軸ラベル(最初と最後の日付のみ)
  const fmtDate = (iso) => {
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };
  svg += `<text x="${x(0)}" y="${H - 8}" text-anchor="start" font-size="11" fill="${cMuted}">${fmtDate(data[0].date)}</text>`;
  if (n > 1) {
    svg += `<text x="${x(n - 1)}" y="${H - 8}" text-anchor="end" font-size="11" fill="${cMuted}">${fmtDate(data[n - 1].date)}</text>`;
  }

  // ホバー用の当たり判定(マークより大きい透明矩形)
  data.forEach((d, i) => {
    const hw = n === 1 ? plotW : plotW / (n - 1);
    const hx = x(i) - hw / 2;
    svg += `<rect data-idx="${i}" x="${Math.max(hx, pad.left)}" y="${pad.top}" width="${hw}" height="${plotH}" fill="transparent"/>`;
  });

  svg += "</svg>";
  container.innerHTML = svg;

  const svgEl = container.querySelector("svg");
  svgEl.addEventListener("mousemove", (e) => {
    const rect = e.target.closest("rect[data-idx]");
    if (!rect) { tooltip.classList.add("hidden"); return; }
    const i = Number(rect.dataset.idx);
    const d = data[i];
    const dt = new Date(d.date);
    const q = questionById(d.questionId).text;
    tooltip.innerHTML = `${dt.getMonth() + 1}/${dt.getDate()} ${dt.getHours()}:${String(dt.getMinutes()).padStart(2, "0")}<br>` +
      `${escapeHtml(q.length > 12 ? q.slice(0, 12) + "…" : q)}<br>` +
      `スコア <strong>${d.score}</strong> / 時間 ${formatTime(d.duration)}`;
    tooltip.classList.remove("hidden");
    const wrapRect = container.closest(".viz-root").getBoundingClientRect();
    const px = x(i) + container.getBoundingClientRect().left - wrapRect.left;
    tooltip.style.left = `${Math.min(Math.max(px - 60, 4), wrapRect.width - 140)}px`;
    tooltip.style.top = `${y(d.score) + 24}px`;
  });
  svgEl.addEventListener("mouseleave", () => tooltip.classList.add("hidden"));
}

/* ---------- 初期化 ---------- */
function init() {
  initHome();

  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => showScreen(tab.dataset.screen));
  });

  $("btn-record").addEventListener("click", startRecording);
  $("btn-stop").addEventListener("click", stopRecording);
  $("btn-cancel").addEventListener("click", cancelPractice);

  $("btn-retry").addEventListener("click", () => {
    $("practice-question").textContent = questionById(state.questionId).text;
    $("timer-target-label").textContent = formatTime(state.target);
    resetPracticeUI();
    showScreen("practice");
  });
  $("btn-home").addEventListener("click", () => showScreen("home"));

  $("btn-clear-history").addEventListener("click", () => {
    if (confirm("練習履歴をすべて削除します。よろしいですか?")) {
      localStorage.removeItem(HISTORY_KEY);
      renderHistory();
    }
  });
}

document.addEventListener("DOMContentLoaded", init);
