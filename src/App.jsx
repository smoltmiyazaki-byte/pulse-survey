import { useState, useEffect, useCallback } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { supabase } from "./supabaseClient";

// ── 設定 ─────────────────────────────────────────────────────────────────────
const MEMBERS = ["上野", "土谷", "柳川", "鹿島"];
const ADMIN_PASSWORD = "smolt2025"; // ← ここを変更してください

const QUESTIONS = [
  { id: "condition",  label: "コンディション",   sub: "今週の体調・気分はどうでしたか？",           lo: "非常に悪い",       hi: "非常に良い" },
  { id: "motivation", label: "モチベーション",   sub: "仕事へのやりがいや意欲はどうでしたか？",     lo: "非常に低い",       hi: "非常に高い" },
  { id: "teamwork",   label: "チームとの連携",   sub: "コミュニケーションや協力はうまくいきましたか？", lo: "うまくいかなかった", hi: "とてもよかった" },
  { id: "workload",   label: "業務量のバランス", sub: "今週の仕事量はどうでしたか？",               lo: "非常に少なかった", hi: "非常に多かった" },
  { id: "atmosphere", label: "職場の雰囲気",     sub: "組織やチームの雰囲気はどうでしたか？",       lo: "非常に悪い",       hi: "非常に良い" },
  { id: "comment",    label: "コメント（任意）", sub: "気になること、伝えたいことがあれば記入してください", type: "text" },
];

const METRICS = [
  { id: "condition",  label: "コンディション", color: "#1D9E75" },
  { id: "motivation", label: "モチベーション", color: "#378ADD" },
  { id: "teamwork",   label: "チーム連携",     color: "#BA7517" },
  { id: "workload",   label: "業務量",         color: "#D4537E" },
  { id: "atmosphere", label: "職場雰囲気",     color: "#7F77DD" },
];

const C5 = ["#E24B4A", "#EF9F27", "#888780", "#5DCAA5", "#1D9E75"];

// ── 週キー生成 ────────────────────────────────────────────────────────────────
function getWeekInfo() {
  const now = new Date();
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yr = d.getUTCFullYear();
  const ys = new Date(Date.UTC(yr, 0, 1));
  const wk = Math.ceil((((d - ys) / 86400000) + 1) / 7);
  return {
    key: `${yr}-W${String(wk).padStart(2, "0")}`,
    label: `${yr}年 第${wk}週`,
  };
}

// ── Supabase ストレージ操作 ───────────────────────────────────────────────────
async function checkAlreadyAnswered(weekKey, name) {
  const { data } = await supabase
    .from("responses")
    .select("id")
    .eq("week_key", weekKey)
    .eq("name", name)
    .maybeSingle();
  return !!data;
}

async function submitResponse(weekKey, answers, name) {
  const { error } = await supabase.from("responses").insert({
    week_key:    weekKey,
    name,
    condition:   answers.condition  ?? null,
    motivation:  answers.motivation ?? null,
    teamwork:    answers.teamwork   ?? null,
    workload:    answers.workload   ?? null,
    atmosphere:  answers.atmosphere ?? null,
    comment:     answers.comment    ?? null,
  });
  return !error;
}

async function fetchAllResponses() {
  const { data } = await supabase
    .from("responses")
    .select("*")
    .order("submitted_at", { ascending: true });
  return data || [];
}

// ── 5段階選択 ─────────────────────────────────────────────────────────────────
function Scale5({ value, onChange, lo, hi }) {
  return (
    <div>
      <div style={{ display: "flex", gap: 10, justifyContent: "space-between", marginBottom: 8 }}>
        {[1, 2, 3, 4, 5].map((v, i) => {
          const sel = value === v;
          return (
            <button key={v} onClick={() => onChange(v)} style={{
              width: 52, height: 52, borderRadius: "50%", fontSize: 16, fontWeight: 500,
              border: `2px solid ${sel ? C5[i] : "#ccc"}`,
              background: sel ? C5[i] : "transparent",
              color: sel ? "#fff" : "inherit",
              padding: 0, transition: "all 0.15s", flexShrink: 0,
            }}>{v}</button>
          );
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontSize: 11, color: "#888780" }}>{lo}</span>
        <span style={{ fontSize: 11, color: "#888780" }}>{hi}</span>
      </div>
    </div>
  );
}

// ── スコアバッジ ───────────────────────────────────────────────────────────────
function ScoreBadge({ val }) {
  if (val == null) return <span style={{ color: "#ccc" }}>—</span>;
  const i = Math.min(Math.round(val) - 1, 4);
  return (
    <span style={{
      display: "inline-block", width: 22, height: 22, borderRadius: "50%",
      background: C5[i], color: "#fff",
      fontSize: 12, fontWeight: 500, lineHeight: "22px", textAlign: "center",
    }}>{Math.round(val)}</span>
  );
}

// ── サーベイ ──────────────────────────────────────────────────────────────────
function SurveyTab({ weekInfo }) {
  const [phase, setPhase] = useState("select");
  const [member, setMember] = useState("");
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({});
  const [submitting, setSubmitting] = useState(false);

  async function onStart() {
    if (!member) return;
    const already = await checkAlreadyAnswered(weekInfo.key, member);
    if (already) { setPhase("already"); return; }
    setStep(0); setAnswers({}); setPhase("questions");
  }

  async function onSubmit() {
    setSubmitting(true);
    await submitResponse(weekInfo.key, answers, member);
    setSubmitting(false);
    setPhase("done");
  }

  const q = QUESTIONS[step];
  const isLast = step === QUESTIONS.length - 1;
  const canNext = q?.type === "text" || answers[q?.id] !== undefined;

  if (phase === "select") return (
    <div style={{ padding: "2rem 0", textAlign: "center" }}>
      <p style={{ fontSize: 15, fontWeight: 500, marginBottom: 6 }}>お名前を選択してください</p>
      <p style={{ fontSize: 13, color: "#888780", marginBottom: 24 }}>回答は週1回です</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 240, margin: "0 auto 24px" }}>
        {MEMBERS.map(m => {
          const sel = member === m;
          return (
            <button key={m} onClick={() => setMember(m)} style={{
              padding: "12px 20px", fontSize: 15, fontWeight: sel ? 500 : 400,
              border: `2px solid ${sel ? "#1D9E75" : "#ddd"}`,
              background: sel ? "#E1F5EE" : "#fff",
              color: sel ? "#0F6E56" : "inherit",
              borderRadius: 10, transition: "all 0.15s",
            }}>{m}</button>
          );
        })}
      </div>
      <button onClick={onStart} disabled={!member} style={{
        padding: "12px 32px", fontSize: 15, fontWeight: 500,
        background: member ? "#1D9E75" : "#ccc", color: "#fff",
        border: "none", borderRadius: 10, transition: "background 0.2s",
      }}>開始する →</button>
    </div>
  );

  if (phase === "already") return (
    <div style={{ padding: "2rem 0", textAlign: "center" }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>✓</div>
      <p style={{ fontSize: 15, fontWeight: 500, margin: "0 0 6px" }}>今週はすでに回答済みです</p>
      <p style={{ fontSize: 13, color: "#888780" }}>{member} さんの回答は受け付けています</p>
    </div>
  );

  if (phase === "done") return (
    <div style={{ padding: "2rem 0", textAlign: "center" }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>🎉</div>
      <p style={{ fontSize: 16, fontWeight: 500, margin: "0 0 6px" }}>回答ありがとうございます！</p>
      <p style={{ fontSize: 13, color: "#888780" }}>来週もよろしくお願いします。</p>
    </div>
  );

  const pct = Math.round(((step + 1) / QUESTIONS.length) * 100);
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <button onClick={() => step > 0 && setStep(s => s - 1)} disabled={step === 0} style={{
          width: 32, height: 32, borderRadius: "50%", border: "1px solid #ddd",
          background: "transparent", fontSize: 16,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>←</button>
        <div style={{ flex: 1, height: 4, background: "#eee", borderRadius: 2, overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: "#1D9E75", transition: "width 0.3s" }} />
        </div>
        <span style={{ fontSize: 12, color: "#888780", minWidth: 32, textAlign: "right" }}>{step + 1}/{QUESTIONS.length}</span>
      </div>

      <div style={{ border: "0.5px solid #e0e0e0", borderRadius: 12, padding: "1.5rem", marginBottom: 16, minHeight: 200 }}>
        <p style={{ fontSize: 16, fontWeight: 500, margin: "0 0 4px" }}>{q.label}</p>
        <p style={{ fontSize: 13, color: "#888780", margin: "0 0 1.5rem" }}>{q.sub}</p>
        {q.type === "text" ? (
          <textarea rows={4} placeholder="任意入力..."
            value={answers[q.id] || ""}
            onChange={e => setAnswers(a => ({ ...a, [q.id]: e.target.value }))}
            style={{ width: "100%", boxSizing: "border-box", resize: "vertical", padding: 10, borderRadius: 8, border: "1px solid #ddd", fontSize: 14 }} />
        ) : (
          <Scale5 value={answers[q.id]} onChange={v => setAnswers(a => ({ ...a, [q.id]: v }))} lo={q.lo} hi={q.hi} />
        )}
      </div>

      <button onClick={() => { if (!isLast) setStep(s => s + 1); else onSubmit(); }}
        disabled={!canNext || submitting} style={{
          width: "100%", padding: 14, fontSize: 15, fontWeight: 500,
          background: canNext ? "#0F6E56" : "#ccc", color: "#fff",
          border: "none", borderRadius: 10, transition: "background 0.2s",
        }}>{submitting ? "送信中..." : isLast ? "送信する" : "次の質問へ →"}</button>
    </div>
  );
}

// ── 管理ログイン ──────────────────────────────────────────────────────────────
function AdminLogin({ onLogin }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState(false);
  function attempt() {
    if (pw === ADMIN_PASSWORD) { onLogin(); }
    else { setErr(true); setPw(""); }
  }
  return (
    <div style={{ padding: "2rem 0", textAlign: "center" }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>🔒</div>
      <p style={{ fontSize: 15, fontWeight: 500, marginBottom: 6 }}>管理者ログイン</p>
      <p style={{ fontSize: 13, color: "#888780", marginBottom: 20 }}>パスワードを入力してください</p>
      <input type="password" value={pw} onChange={e => { setPw(e.target.value); setErr(false); }}
        onKeyDown={e => e.key === "Enter" && attempt()}
        placeholder="パスワード"
        style={{ padding: "10px 16px", fontSize: 14, border: `1px solid ${err ? "#E24B4A" : "#ddd"}`, borderRadius: 8, width: "100%", maxWidth: 240, marginBottom: 8, display: "block", margin: "0 auto 8px" }} />
      {err && <p style={{ fontSize: 12, color: "#E24B4A", margin: "0 0 8px" }}>パスワードが正しくありません</p>}
      <button onClick={attempt} style={{
        marginTop: 12, padding: "10px 28px", fontSize: 14, fontWeight: 500,
        background: "#1D9E75", color: "#fff", border: "none", borderRadius: 8,
      }}>ログイン</button>
    </div>
  );
}

// ── 管理ダッシュボード ────────────────────────────────────────────────────────
function AdminDashboard({ weekInfo, onLogout }) {
  const [responses, setResponses] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await fetchAllResponses();
    setResponses(data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <p style={{ textAlign: "center", color: "#888780", padding: "2rem 0" }}>読み込み中...</p>;
  if (!responses.length) return (
    <div style={{ textAlign: "center", padding: "2rem 0", color: "#888780" }}>
      <p>まだ回答データがありません</p>
    </div>
  );

  // 週ごとにグループ化
  const byWeek = {};
  responses.forEach(r => {
    if (!byWeek[r.week_key]) byWeek[r.week_key] = [];
    byWeek[r.week_key].push(r);
  });
  const weeks = Object.keys(byWeek).sort().slice(-8);
  const latestKey = weeks[weeks.length - 1];
  const latestResps = byWeek[latestKey] || [];
  const latestWeekNum = parseInt(latestKey.split("-W")[1]);

  // チャートデータ
  const chartData = weeks.map(w => {
    const rs = byWeek[w];
    const wn = parseInt(w.split("-W")[1]);
    const row = { week: `第${wn}週` };
    METRICS.forEach(m => {
      const vals = rs.map(r => r[m.id]).filter(v => v != null);
      row[m.id] = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length * 10) / 10 : null;
    });
    return row;
  });

  const respondedNames = latestResps.map(r => r.name);
  const notResponded = MEMBERS.filter(m => !respondedNames.includes(m));

  return (
    <div>
      {/* ヘッダー */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <span style={{ fontSize: 11, color: "#888780", letterSpacing: "0.06em" }}>管理者ビュー</span>
          <p style={{ margin: "2px 0 0", fontSize: 15, fontWeight: 500 }}>{weekInfo.label}</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={load} style={{ fontSize: 12, padding: "6px 12px", border: "1px solid #ddd", borderRadius: 6, background: "#fff" }}>更新</button>
          <button onClick={onLogout} style={{ fontSize: 12, padding: "6px 12px", border: "1px solid #ddd", borderRadius: 6, background: "#fff", color: "#888780" }}>ログアウト</button>
        </div>
      </div>

      {/* 回答状況 */}
      <div style={{ border: "0.5px solid #e0e0e0", borderRadius: 12, padding: "1rem 1.25rem", marginBottom: 16 }}>
        <p style={{ fontSize: 12, color: "#888780", margin: "0 0 10px", fontWeight: 500 }}>今週の回答状況</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {MEMBERS.map(m => {
            const done = respondedNames.includes(m);
            return (
              <span key={m} style={{
                padding: "5px 12px", borderRadius: 20, fontSize: 13, fontWeight: 500,
                background: done ? "#E1F5EE" : "#F1EFE8",
                color: done ? "#0F6E56" : "#888780",
                border: `1px solid ${done ? "#5DCAA5" : "#D3D1C7"}`,
              }}>{done ? "✓ " : ""}{m}</span>
            );
          })}
        </div>
        {notResponded.length > 0 && (
          <p style={{ fontSize: 12, color: "#888780", margin: "10px 0 0" }}>未回答：{notResponded.join("、")}</p>
        )}
      </div>

      {/* サマリーカード */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))", gap: 8, marginBottom: 20 }}>
        {[
          { label: "回答者数", value: `${latestResps.length}/${MEMBERS.length}`, sub: "名" },
          ...METRICS.map(m => {
            const vals = latestResps.map(r => r[m.id]).filter(v => v != null);
            const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
            return { label: m.label, value: avg != null ? avg.toFixed(1) : "—", sub: "/ 5.0" };
          })
        ].map((c, i) => (
          <div key={i} style={{ background: "#F8F8F6", borderRadius: 8, padding: "10px 12px" }}>
            <p style={{ fontSize: 11, color: "#888780", margin: "0 0 4px" }}>{c.label}</p>
            <p style={{ fontSize: 20, fontWeight: 500, margin: 0, lineHeight: 1.2 }}>
              {c.value}<span style={{ fontSize: 11, color: "#888780", fontWeight: 400, marginLeft: 3 }}>{c.sub}</span>
            </p>
          </div>
        ))}
      </div>

      {/* トレンドチャート */}
      <p style={{ fontSize: 13, fontWeight: 500, color: "#888780", margin: "0 0 8px" }}>週次トレンド（過去8週）</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, fontSize: 12, color: "#888780", marginBottom: 8 }}>
        {METRICS.map(m => (
          <span key={m.id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: m.color, display: "inline-block" }} />{m.label}
          </span>
        ))}
      </div>
      <div style={{ width: "100%", height: 220, marginBottom: 28 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="week" tick={{ fontSize: 11, fill: "#888780" }} />
            <YAxis domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} tick={{ fontSize: 11, fill: "#888780" }} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "0.5px solid #ddd" }} />
            {METRICS.map(m => (
              <Line key={m.id} type="monotone" dataKey={m.id} name={m.label}
                stroke={m.color} strokeWidth={2} dot={{ r: 3, fill: m.color }}
                connectNulls activeDot={{ r: 5 }} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* 履歴 */}
      <p style={{ fontSize: 13, fontWeight: 500, color: "#888780", margin: "0 0 12px" }}>回答履歴</p>
      {[...weeks].reverse().slice(0, 6).map(wk => {
        const [wy, ww] = wk.split("-W");
        const rs = byWeek[wk];
        return (
          <div key={wk} style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 500 }}>{wy}年 第{parseInt(ww)}週</span>
              <span style={{ fontSize: 12, color: "#888780" }}>{rs.length}/{MEMBERS.length}名</span>
            </div>
            <div style={{ border: "0.5px solid #e0e0e0", borderRadius: 10, overflow: "hidden" }}>
              {rs.map((r, i) => (
                <div key={i} style={{ padding: "10px 14px", borderBottom: i < rs.length - 1 ? "0.5px solid #f0f0f0" : "none" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
                    <span style={{ fontSize: 14, fontWeight: 500 }}>{r.name}</span>
                    <div style={{ display: "flex", gap: 12, fontSize: 12, color: "#888780", alignItems: "center" }}>
                      {METRICS.map(m => (
                        <span key={m.id} style={{ display: "flex", alignItems: "center", gap: 3 }}>
                          {m.label.slice(0, 3)} <ScoreBadge val={r[m.id]} />
                        </span>
                      ))}
                    </div>
                  </div>
                  {r.comment && (
                    <p style={{ fontSize: 12, color: "#888780", margin: "8px 0 0", padding: "6px 10px", background: "#F8F8F6", borderRadius: 6 }}>
                      "{r.comment}"
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── ルート ────────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState("survey");
  const [adminLoggedIn, setAdminLoggedIn] = useState(false);
  const [weekInfo] = useState(getWeekInfo);

  const tabBtn = (id, label) => (
    <button onClick={() => setTab(id)} style={{
      fontSize: 13, padding: "6px 16px",
      fontWeight: tab === id ? 500 : 400,
      background: "transparent", border: "none",
      borderBottom: `2px solid ${tab === id ? "#0F6E56" : "transparent"}`,
      color: tab === id ? "#0F6E56" : "#888",
      transition: "all 0.15s",
    }}>{label}</button>
  );

  return (
    <div style={{ maxWidth: 580, margin: "0 auto", padding: "0.5rem 0 3rem" }}>
      {/* ヘッダー */}
      <div style={{ paddingBottom: "0.75rem", borderBottom: "0.5px solid #e0e0e0", marginBottom: "1.25rem" }}>
        <p style={{ fontSize: 11, color: "#888780", margin: "0 0 2px", letterSpacing: "0.06em" }}>SMOLT 株式会社</p>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 16, fontWeight: 500 }}>週次パルスサーベイ｜{weekInfo.label}</span>
          <div>{tabBtn("survey", "サーベイ")}{tabBtn("admin", "管理")}</div>
        </div>
      </div>

      {tab === "survey" && <SurveyTab weekInfo={weekInfo} />}
      {tab === "admin" && (
        adminLoggedIn
          ? <AdminDashboard weekInfo={weekInfo} onLogout={() => setAdminLoggedIn(false)} />
          : <AdminLogin onLogin={() => setAdminLoggedIn(true)} />
      )}
    </div>
  );
}
