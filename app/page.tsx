// ─────────────────────────────────────────────────────────
// これは「業務アプリの画面」です。宣伝ページ（LP）ではありません。
//
// 題材: 業務と自主活動を1画面に並べ、見積もり時間と実績時間のズレを見る
//       （docs/03_spec.md）
//
// 画面の骨格（この形は崩さない）:
//   左メニュー（.side）＋ 上部バー（.topbar）＋ 本体（.content）
//   一覧 / 新規登録 / 設定 の3画面を view で切り替える
// ─────────────────────────────────────────────────────────
"use client";

import { useEffect, useMemo, useState } from "react";

// ═══════════════════════════════════════════════════════════
//  画面の型 ── docs/03_spec.md の「0. 画面の型」で決めたもの
//  ⚠ 新しいCSSは書かない。選択肢から選ぶだけ。
// ═══════════════════════════════════════════════════════════

/** 色み。BtoB企業のオフィスワークとして indigo（🔮 業種は未確認） */
const TONE = "indigo";

/** 密度。1日数件〜10件程度と見て normal（🔮 件数は未確認） */
const DENSITY = "normal";

/** 画面の型。業務と自主活動を並べて見たいので、区分ごとに束ねる stage */
const LAYOUT: "queue" | "stage" | "due" = "stage";

/** 数え方。案件でも現場でもなく「自分のタスク」を数える */
const UNIT = "タスク";

/** 区分。stage の束ねに使う。今回は段階ではなく「業務／自主活動」 */
const CATEGORIES = ["業務", "自主活動"];

// ═══════════════════════════════════════════════════════════

/** 状態。未着手 → 進行中 → 完了 の順に進む */
type Status = "未着手" | "進行中" | "完了";
const STATUSES: Status[] = ["未着手", "進行中", "完了"];

/** 1件のタスク。データ項目は5つ（id を除く） */
type Task = {
  id: string;
  title: string;        // タイトル
  category: string;     // 区分（業務 / 自主活動）
  plan: number;         // 見積もり時間
  actual: number | null; // 実績時間（未入力は null）
  status: Status;       // 状態
};

type View = "list" | "new" | "settings";
type Filter = "open" | "done" | "all";

const KEY = "task-hours-data";
const NAME_KEY = "task-hours-appname";

/** 入力できる時間。0.5刻み・8.0時間まで */
const HOURS = Array.from({ length: 16 }, (_, i) => (i + 1) * 0.5);

/** 画面の型ごとの言葉。ここを直せば画面じゅうの文言が揃って変わる */
const TEXT = {
  queue: {
    sub: "待たせている順に並びます",
    open: "未対応", done: "対応済", catLabel: "区分", headOpen: "未対応",
  },
  stage: {
    sub: "見積もりと実績の差を見ます",
    open: "未完了", done: "完了", catLabel: "区分", headOpen: "未完了",
  },
  due: {
    sub: "期限が近い順に並びます",
    open: "未完了", done: "完了", catLabel: "種別", headOpen: "未完了",
  },
}[LAYOUT];

const isDone = (t: Task) => t.status === "完了";

/** 0.5刻みの足し算で端数が出ないように丸める */
const r1 = (n: number) => Math.round(n * 10) / 10;

/** 2.0 → "2.0h" */
const h = (n: number) => r1(n).toFixed(1) + "h";

/** 差。1.5 → "+1.5h" / -1.5 → "-1.5h" / 0 → "0.0h" */
const sh = (n: number) => {
  const v = r1(n);
  return (v > 0 ? "+" : "") + (v === 0 ? 0 : v).toFixed(1) + "h";
};

/** 実績が入っているタスクだけの差（実績 − 見積もり） */
const gapOf = (t: Task) => (t.actual === null ? null : r1(t.actual - t.plan));

/**
 * 見本データ。⚠ 実在の人名・会社名・連絡先は使わない。
 * 未完了9 / 完了5 の14タスク。業務は見積もりを超えがち、自主活動は届かない。
 */
const SAMPLE: Task[] = [
  { id: "s01", title: "月次レポートの作成",        category: "業務",     plan: 2.0, actual: 3.5,  status: "完了"   },
  { id: "s02", title: "後輩の設計レビュー",        category: "業務",     plan: 1.0, actual: null, status: "進行中" },
  { id: "s03", title: "他部署との仕様すり合わせ",  category: "業務",     plan: 1.5, actual: 2.5,  status: "完了"   },
  { id: "s04", title: "見積書の確認と差し戻し",    category: "業務",     plan: 0.5, actual: 0.5,  status: "完了"   },
  { id: "s05", title: "定例会の資料づくり",        category: "業務",     plan: 1.5, actual: null, status: "進行中" },
  { id: "s06", title: "障害の一次調査",            category: "業務",     plan: 1.0, actual: 2.0,  status: "完了"   },
  { id: "s07", title: "来期の体制案をまとめる",    category: "業務",     plan: 3.0, actual: null, status: "未着手" },
  { id: "s08", title: "新人向け手順書の更新",      category: "業務",     plan: 2.0, actual: null, status: "未着手" },
  { id: "s09", title: "週次の進捗まとめ",          category: "業務",     plan: 0.5, actual: null, status: "進行中" },
  { id: "s10", title: "資格講座 第3章",            category: "自主活動", plan: 2.0, actual: 0.5,  status: "進行中" },
  { id: "s11", title: "資格講座 第4章",            category: "自主活動", plan: 2.0, actual: null, status: "未着手" },
  { id: "s12", title: "過去問 2周目（第1回）",     category: "自主活動", plan: 1.5, actual: null, status: "未着手" },
  { id: "s13", title: "技術書の読書メモをつける",  category: "自主活動", plan: 1.0, actual: null, status: "進行中" },
  { id: "s14", title: "業界レポートの読み込み",    category: "自主活動", plan: 1.0, actual: 0.5,  status: "完了"   },
];

/** 一覧をどう束ねるか */
type Group = { key: string; label: string; items: Task[] };

function grouped(list: Task[], filter: Filter): Group[] {
  if (LAYOUT === "stage") {
    // 区分ごとに束ねる。CATEGORIES の順に並べ、中身が無い区分は出さない
    return CATEGORIES.map((c) => ({
      key: c,
      label: c,
      items: list.filter((i) => i.category === c),
    })).filter((g) => g.items.length > 0);
  }
  const head = filter === "open" ? TEXT.headOpen : filter === "done" ? TEXT.done : "すべて";
  return [{ key: "all", label: head, items: list }];
}

/** 次に押すと、どの状態になるか */
const nextStatus = (s: Status): Status => STATUSES[(STATUSES.indexOf(s) + 1) % STATUSES.length];

export default function Home() {
  const [items, setItems] = useState<Task[]>([]);
  const [appName, setAppName] = useState("見積もりと実績");
  const [loaded, setLoaded] = useState(false);

  const [view, setView] = useState<View>("list");
  // 初期は「全部」。この画面の本体は、区分ごとの「置いた時間」と「できた時間」の対比なので、
  // 未完了だけに絞ると実績が常に 0 近くになり、差が見えなくなる
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Task | null>(null);

  const [form, setForm] = useState({
    title: "",
    category: CATEGORIES[0],
    plan: 1,
    actual: "",
    status: "未着手" as Status,
  });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      setItems(raw ? (JSON.parse(raw) as Task[]) : SAMPLE);
      const n = localStorage.getItem(NAME_KEY);
      if (n) setAppName(n);
    } catch {
      setItems(SAMPLE);
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    localStorage.setItem(KEY, JSON.stringify(items));
    localStorage.setItem(NAME_KEY, appName);
  }, [items, appName, loaded]);

  // 見本データのまま触っていない状態か（1件でも足す・消すと false になる）
  const isSample = items.length === SAMPLE.length && items.every((i) => i.id.startsWith("s"));

  const counts = useMemo(
    () => ({
      open: items.filter((i) => !isDone(i)).length,
      done: items.filter((i) => isDone(i)).length,
      all: items.length,
    }),
    [items]
  );

  /** 上部の数字3つ。見積もりは全タスク、実績と差は「実績を入れたタスク」だけ */
  const totals = useMemo(() => {
    const entered = items.filter((i) => i.actual !== null);
    return {
      plan: r1(items.reduce((s, i) => s + i.plan, 0)),
      actual: r1(entered.reduce((s, i) => s + (i.actual ?? 0), 0)),
      gap: r1(entered.reduce((s, i) => s + ((i.actual ?? 0) - i.plan), 0)),
    };
  }, [items]);

  const shown = useMemo(() => {
    const k = q.trim().toLowerCase();
    return items
      .filter((i) => (filter === "all" ? true : filter === "open" ? !isDone(i) : isDone(i)))
      .filter((i) => !k || (i.title + i.category + i.status).toLowerCase().includes(k))
      .slice()
      .sort((a, b) => Number(isDone(a)) - Number(isDone(b)));
  }, [items, filter, q]);

  const groups = useMemo(() => grouped(shown, filter), [shown, filter]);

  function resetForm() {
    setForm({ title: "", category: CATEGORIES[0], plan: 1, actual: "", status: "未着手" });
    setEditing(null);
  }

  function save() {
    const title = form.title.trim();
    if (!title) return;
    if (editing) {
      setItems(
        items.map((i) =>
          i.id === editing.id
            ? {
                ...i,
                title,
                category: form.category,
                plan: form.plan,
                actual: form.actual === "" ? null : Number(form.actual),
                status: form.status,
              }
            : i
        )
      );
    } else {
      // 登録した時点では、実績はまだ分からない
      setItems([
        ...items,
        { id: String(Date.now()), title, category: form.category, plan: form.plan, actual: null, status: "未着手" },
      ]);
    }
    resetForm();
    setView("list");
  }

  function startEdit(t: Task) {
    setEditing(t);
    setForm({
      title: t.title,
      category: t.category,
      plan: t.plan,
      actual: t.actual === null ? "" : String(t.actual),
      status: t.status,
    });
    setView("new");
  }

  /** 操作2: 実績時間を、一覧の行から直接入れる */
  const setActual = (id: string, v: string) =>
    setItems(items.map((i) => (i.id === id ? { ...i, actual: v === "" ? null : Number(v) } : i)));

  /** 操作3: 状態を進める（未着手 → 進行中 → 完了 → 未着手） */
  const advance = (id: string) =>
    setItems(items.map((i) => (i.id === id ? { ...i, status: nextStatus(i.status) } : i)));

  const remove = (id: string) => setItems(items.filter((i) => i.id !== id));

  const NAV: { k: View; label: string; count?: number }[] = [
    { k: "list", label: "一覧", count: counts.open },
    { k: "new", label: "新規登録" },
    { k: "settings", label: "設定" },
  ];

  const titles: { [K in View]: [string, string] } = {
    list: ["一覧", TEXT.sub],
    new: [editing ? "編集" : "新規登録", "入力して保存すると、一覧に追加されます"],
    settings: ["設定", "表示名の変更と、データの初期化"],
  };

  return (
    <div className="shell" data-tone={TONE} data-density={DENSITY}>
      {/* ───────── 左メニュー ───────── */}
      <nav className="side">
        <div className="side-brand">
          <div className="n">{appName}</div>
          <div className="s">この端末に保存</div>
        </div>
        <div className="side-label">メニュー</div>
        <div className="side-nav">
          {NAV.map((n) => (
            <button
              key={n.k}
              className="side-item"
              aria-current={view === n.k ? "page" : undefined}
              onClick={() => { if (n.k !== "new") resetForm(); setView(n.k); }}
            >
              {n.label}
              {typeof n.count === "number" && <span className="c">{n.count}</span>}
            </button>
          ))}
        </div>
        <div className="side-foot">差は、実績を入れた{UNIT}だけで計算します</div>
      </nav>

      {/* ───────── 本体 ───────── */}
      <div className="main">
        <header className="topbar">
          <span className="t">{titles[view][0]}</span>
          <span className="d">{titles[view][1]}</span>
          {view === "list" && (
            <span className="right">
              <button className="btn" onClick={() => { resetForm(); setView("new"); }}>新規登録</button>
            </span>
          )}
        </header>

        <div className="content">
          {/* ── 一覧 ── */}
          {view === "list" && (
            <>
              {isSample && (
                <div className="notice">
                  表示中のデータは<b>見本</b>です。そのまま触って試せます。
                  消したいときは、左メニューの<b>設定</b>から。
                </div>
              )}

              <div className="stats">
                <div className="stat"><div className="n accent">{h(totals.plan)}</div><div className="l">見積もり合計</div></div>
                <div className="stat"><div className="n">{h(totals.actual)}</div><div className="l">実績合計</div></div>
                <div className="stat"><div className="n">{sh(totals.gap)}</div><div className="l">差（実績を入れた分）</div></div>
              </div>

              <div className="filters">
                <div className="search">
                  <input className="field" value={q} onChange={(e) => setQ(e.target.value)}
                    placeholder="タイトル・区分・状態で検索" />
                </div>
                <div className="seg">
                  {(["open", "done", "all"] as Filter[]).map((f) => (
                    <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>
                      {f === "open" ? `${TEXT.open} ${counts.open}`
                        : f === "done" ? `${TEXT.done} ${counts.done}`
                        : `全部 ${counts.all}`}
                    </button>
                  ))}
                </div>
              </div>

              <div className="list">
                {shown.length === 0 ? (
                  <>
                    <div className="list-head">
                      {filter === "open" ? TEXT.headOpen : filter === "done" ? TEXT.done : "すべて"}
                      <span className="count">0 {UNIT}</span>
                    </div>
                    <div className="empty">
                      <div className="t">{q ? "見つかりませんでした" : `ここに表示する${UNIT}がありません`}</div>
                      <div className="d">
                        {q
                          ? "検索の言葉を変えてみてください。"
                          : "右上の「新規登録」から、タイトルと見積もり時間を入れて追加できます。"}
                      </div>
                    </div>
                  </>
                ) : (
                  groups.map((g) => {
                    const gPlan = r1(g.items.reduce((s, i) => s + i.plan, 0));
                    const gActual = r1(g.items.reduce((s, i) => s + (i.actual ?? 0), 0));
                    return (
                      <div key={g.key}>
                        <div className="group-head">
                          {g.label}
                          <span className="count">
                            見積 {h(gPlan)} / 実績 {h(gActual)}　{g.items.length} {UNIT}
                          </span>
                        </div>
                        {g.items.map((t) => {
                          const gap = gapOf(t);
                          return (
                            <div className="row" key={t.id}>
                              <div className="row-main">
                                <div className="row-title">{t.title}</div>
                                <div className="row-sub">
                                  見積 {h(t.plan)} → 実績 {t.actual === null ? "未入力" : h(t.actual)}
                                </div>
                              </div>
                              <div className="row-meta">
                                {gap !== null && gap !== 0 && <span className="badge">{sh(gap)}</span>}
                                <span className={"badge" + (isDone(t) ? " badge-ok" : "")}>{t.status}</span>
                                <select
                                  className="select field"
                                  aria-label={`${t.title} の実績時間`}
                                  value={t.actual === null ? "" : String(t.actual)}
                                  onChange={(e) => setActual(t.id, e.target.value)}
                                >
                                  <option value="">実績 未入力</option>
                                  {HOURS.map((v) => (
                                    <option key={v} value={v}>実績 {v.toFixed(1)}h</option>
                                  ))}
                                </select>
                                <button className="btn-ghost" onClick={() => startEdit(t)}>編集</button>
                                <button className="btn-ghost" onClick={() => advance(t.id)}>
                                  {nextStatus(t.status)}にする
                                </button>
                                <button className="btn-ghost danger-btn" onClick={() => remove(t.id)}>削除</button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })
                )}
              </div>
              <p className="note">データはこの端末のブラウザにだけ保存されます。外部には送信されません。</p>
            </>
          )}

          {/* ── 新規登録・編集 ── */}
          {view === "new" && (
            <div className="panel">
              <div className="form-row">
                <label className="label" htmlFor="f-title">タイトル<span className="req">必須</span></label>
                <input id="f-title" className="field" value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  onKeyDown={(e) => { if (e.key === "Enter") save(); }}
                  placeholder="例：資格講座 第3章" />
                <span className="hint">あとで見て何のタスクか分かる書き方にします</span>
              </div>

              <div className="form-row">
                <div className="inline">
                  <div>
                    <label className="label" htmlFor="f-cat">{TEXT.catLabel}</label>
                    <select id="f-cat" className="select" value={form.category}
                      onChange={(e) => setForm({ ...form, category: e.target.value })}>
                      {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label" htmlFor="f-plan">見積もり時間</label>
                    <select id="f-plan" className="select" value={String(form.plan)}
                      onChange={(e) => setForm({ ...form, plan: Number(e.target.value) })}>
                      {HOURS.map((v) => <option key={v} value={v}>{v.toFixed(1)}h</option>)}
                    </select>
                  </div>
                </div>
                <span className="hint">実績時間は、終わったあとに一覧から入れます</span>
              </div>

              {editing && (
                <div className="form-row">
                  <div className="inline">
                    <div>
                      <label className="label" htmlFor="f-actual">実績時間</label>
                      <select id="f-actual" className="select" value={form.actual}
                        onChange={(e) => setForm({ ...form, actual: e.target.value })}>
                        <option value="">未入力</option>
                        {HOURS.map((v) => <option key={v} value={v}>{v.toFixed(1)}h</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="label" htmlFor="f-status">状態</label>
                      <select id="f-status" className="select" value={form.status}
                        onChange={(e) => setForm({ ...form, status: e.target.value as Status })}>
                        {STATUSES.map((s) => <option key={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              <div className="form-actions">
                <button className="btn" onClick={save} disabled={!form.title.trim()}>
                  {editing ? "保存する" : "一覧に追加"}
                </button>
                <button className="btn-ghost" onClick={() => { resetForm(); setView("list"); }}>やめる</button>
                <span className="spacer" />
                {editing && (
                  <button className="btn-ghost danger-btn"
                    onClick={() => { remove(editing.id); resetForm(); setView("list"); }}>
                    この1{UNIT}を削除
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ── 設定 ── */}
          {view === "settings" && (
            <div className="panel">
              <div className="form-row">
                <label className="label" htmlFor="f-app">画面の表示名</label>
                <input id="f-app" className="field" value={appName}
                  onChange={(e) => setAppName(e.target.value)} />
                <span className="hint">左上に表示されます。変えるとすぐ反映されます</span>
              </div>

              <div className="form-row">
                <label className="label">データ</label>
                <div className="inline">
                  <button className="btn-ghost" onClick={() => setItems(SAMPLE)}>見本データを入れ直す</button>
                  <button className="btn-ghost danger-btn"
                    onClick={() => { if (confirm("全部消します。よろしいですか？")) setItems([]); }}>
                    全部消す
                  </button>
                </div>
                <span className="hint">
                  現在 {counts.all} {UNIT}（{TEXT.open} {counts.open} / {TEXT.done} {counts.done}）
                  ／ 見積もり合計 {h(totals.plan)}・実績合計 {h(totals.actual)}
                </span>
              </div>

              <p className="note">
                データはこの端末のブラウザにだけ保存されます。
                別の端末や他の人とは共有されません（共有は第3回で扱います）。
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
