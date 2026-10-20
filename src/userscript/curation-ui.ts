import {
  type CurationBlog,
  type Oldest,
  sortCandidates,
} from "../core/curation";
import type { FollowingBlog, Storage } from "../core/feed-sampling";
import { fillOldest } from "../core/oldest";
import { dropFromHistory, readHistory, unfollowAll } from "../core/unfollow";
import type { TumblrApi } from "./tumblr-api";

const PROTECTED_KEY = "protected";
const FOLLOWING_KEY = "following:me";
const FOLLOWING_TTL = 86_400;
const UNFOLLOW_DELAY_MS = 1500;
const PAGE_ROWS = 300;

export function formatDate(ts: number | undefined): string {
  if (!ts) return "-";
  return new Date(ts * 1000).toISOString().slice(0, 10);
}

export function formatOldest(oldest: Oldest | undefined): string {
  if (!oldest) return "未取得";
  if (oldest.kind === "empty") return "ポストなし";
  return formatDate(oldest.ts);
}

const CSS = `
.ees-cur{position:fixed;inset:0;z-index:100000;background:#001935;color:#fff;
  font:13px/1.4 system-ui,sans-serif;display:flex;flex-direction:column}
.ees-cur header{display:flex;gap:8px;align-items:center;padding:10px 16px;
  border-bottom:1px solid #35465c;flex-wrap:wrap}
.ees-cur header h2{font-size:15px;margin:0 12px 0 0}
.ees-cur .status{flex:1;color:#b8c3cf;min-width:200px}
.ees-cur button{background:#1f3550;color:#fff;border:1px solid #35465c;
  border-radius:6px;padding:5px 10px;font:inherit;cursor:pointer}
.ees-cur button:disabled{opacity:.5;cursor:default}
.ees-cur button.danger{background:#7a2230;border-color:#a33a4a}
.ees-cur .body{flex:1;overflow:auto}
.ees-cur table{border-collapse:collapse;width:100%}
.ees-cur th,.ees-cur td{padding:4px 10px;border-bottom:1px solid #1f3550;
  text-align:left;white-space:nowrap}
.ees-cur th{position:sticky;top:0;background:#0b2440;font-weight:600}
.ees-cur td.num{text-align:right}
.ees-cur tr.protected td{color:#7f8fa3}
.ees-cur a{color:#8ec5ff;text-decoration:none}
.ees-cur .title{color:#b8c3cf;max-width:280px;overflow:hidden;text-overflow:ellipsis}
`;

type State = {
  blogs: CurationBlog[];
  protectedNames: Set<string>;
  selected: Set<string>;
  view: "following" | "history";
  status: string;
  busy: boolean;
  shown: number;
};

export function openCuration(deps: {
  api: TumblrApi;
  storage: Storage;
  now: () => number;
  confirm: (message: string) => boolean;
}): void {
  if (document.querySelector(".ees-cur")) return;
  const root = document.createElement("div");
  root.className = "ees-cur";
  const style = document.createElement("style");
  style.textContent = CSS;
  root.appendChild(style);
  root.addEventListener("keydown", (e) => e.stopPropagation());

  const header = document.createElement("header");
  const body = document.createElement("div");
  body.className = "body";
  root.append(header, body);
  document.body.appendChild(root);

  const state: State = {
    blogs: [],
    protectedNames: new Set(),
    selected: new Set(),
    view: "following",
    status: "フォロー一覧を取得中…",
    busy: true,
    shown: PAGE_ROWS,
  };
  let closed = false;

  const button = (label: string, onClick: () => void, cls = "") => {
    const b = document.createElement("button");
    b.textContent = label;
    if (cls) b.className = cls;
    b.addEventListener("click", onClick);
    return b;
  };

  const renderHeader = () => {
    header.replaceChildren();
    const h = document.createElement("h2");
    h.textContent = "フォロー整理";
    const status = document.createElement("span");
    status.className = "status";
    status.textContent = state.status;
    const unfollowBtn = button(
      `選択をアンフォロー (${state.selected.size})`,
      () => void runUnfollow(),
      "danger",
    );
    unfollowBtn.disabled = state.busy || state.selected.size === 0;
    const fetchBtn = button("最古ポスト日を取得", () => void runFill());
    fetchBtn.disabled = state.busy;
    const viewBtn = button(
      state.view === "following" ? "外した履歴" : "フォロー一覧へ",
      () => {
        state.view = state.view === "following" ? "history" : "following";
        void render();
      },
    );
    const closeBtn = button("閉じる", () => {
      closed = true;
      root.remove();
    });
    header.append(h, status, fetchBtn, unfollowBtn, viewBtn, closeBtn);
  };

  const cell = (row: HTMLTableRowElement, content: string | Node, cls = "") => {
    const td = document.createElement("td");
    if (cls) td.className = cls;
    td.append(content);
    row.appendChild(td);
    return td;
  };

  const table = (headings: string[]) => {
    const t = document.createElement("table");
    const tr = document.createElement("tr");
    for (const h of headings) {
      const th = document.createElement("th");
      th.textContent = h;
      tr.appendChild(th);
    }
    t.createTHead().appendChild(tr);
    return t;
  };

  const blogLink = (name: string, url: string) => {
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = name;
    return a;
  };

  const renderFollowing = () => {
    const t = table([
      "",
      "ブログ",
      "タイトル",
      "最古ポスト",
      "ポスト数",
      "最終ポスト",
      "フォロー日",
      "保護",
    ]);
    const tbody = t.createTBody();
    const sorted = sortCandidates(state.blogs, state.protectedNames);
    for (const b of sorted.slice(0, state.shown)) {
      const isProtected = state.protectedNames.has(b.name);
      const tr = tbody.insertRow();
      if (isProtected) tr.className = "protected";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = state.selected.has(b.name);
      cb.disabled = isProtected;
      cb.addEventListener("change", () => {
        if (cb.checked) state.selected.add(b.name);
        else state.selected.delete(b.name);
        renderHeader();
      });
      cell(tr, cb);
      cell(tr, blogLink(b.name, b.url));
      cell(tr, b.title, "title");
      cell(tr, formatOldest(b.oldest));
      cell(tr, b.posts.toLocaleString(), "num");
      cell(tr, formatDate(b.updated));
      cell(tr, formatDate(b.followedAt));
      cell(
        tr,
        button(
          isProtected ? "解除" : "保護",
          () => void toggleProtected(b.name),
        ),
      );
    }
    body.replaceChildren(t);
    const rest = sorted.length - state.shown;
    if (rest > 0) {
      body.appendChild(
        button(`さらに表示 (残り ${rest} 件)`, () => {
          state.shown += PAGE_ROWS;
          renderFollowing();
        }),
      );
    }
  };

  const renderHistory = async () => {
    const history = await readHistory(deps.storage);
    const t = table(["ブログ", "外した日", ""]);
    const tbody = t.createTBody();
    for (const r of history) {
      const tr = tbody.insertRow();
      cell(tr, blogLink(r.name, r.url));
      cell(tr, formatDate(r.at));
      const b = button("再フォロー", () => void refollow(r.name, r.url, b));
      b.disabled = state.busy;
      cell(tr, b);
    }
    body.replaceChildren(t);
  };

  const render = async () => {
    renderHeader();
    if (state.view === "following") renderFollowing();
    else await renderHistory();
  };

  let renderTimer: ReturnType<typeof setTimeout> | undefined;
  const renderSoon = () => {
    if (renderTimer) return;
    renderTimer = setTimeout(() => {
      renderTimer = undefined;
      void render();
    }, 2000);
  };

  const saveFollowingCache = () =>
    deps.storage.putJSON(
      FOLLOWING_KEY,
      state.blogs.map(
        (b): FollowingBlog => ({ name: b.name, updated: b.updated }),
      ),
      FOLLOWING_TTL,
    );

  const toggleProtected = async (name: string) => {
    if (state.protectedNames.has(name)) state.protectedNames.delete(name);
    else {
      state.protectedNames.add(name);
      state.selected.delete(name);
    }
    await deps.storage.putJSON(PROTECTED_KEY, [...state.protectedNames]);
    await render();
  };

  const runFill = async () => {
    state.busy = true;
    const byName = new Map(state.blogs.map((b) => [b.name, b]));
    const total = state.blogs.length;
    let done = state.blogs.filter((b) => b.oldest).length;
    const result = await fillOldest({
      blogs: state.blogs,
      storage: deps.storage,
      fetchOldest: deps.api.oldest,
      concurrency: 3,
      shouldStop: () => closed,
      onResult: (name, oldest) => {
        const b = byName.get(name);
        if (b && !b.oldest) done++;
        if (b) b.oldest = oldest;
        state.status = `最古ポスト日を取得中… ${done} / ${total}`;
        renderSoon();
      },
    });
    for (const [name, oldest] of result.oldest) {
      const b = byName.get(name);
      if (b) b.oldest = oldest;
    }
    state.busy = false;
    const missing = state.blogs.filter((b) => !b.oldest).length;
    state.status = result.rateLimited
      ? `レート制限で中断しました。未取得 ${missing} 件。時間をおいて再取得してください`
      : missing > 0
        ? `未取得 ${missing} 件(失敗 ${result.failed} 件)。再取得できます`
        : `${total} 件`;
    await render();
  };

  const runUnfollow = async () => {
    const targets = state.blogs.filter((b) => state.selected.has(b.name));
    const preview = targets
      .slice(0, 10)
      .map((b) => b.name)
      .join("\n");
    const more = targets.length > 10 ? `\n…ほか ${targets.length - 10} 件` : "";
    if (
      !deps.confirm(
        `${targets.length} 件をアンフォローします。\n\n${preview}${more}`,
      )
    ) {
      return;
    }
    state.busy = true;
    let count = 0;
    const result = await unfollowAll({
      targets,
      unfollow: deps.api.unfollow,
      storage: deps.storage,
      delayMs: UNFOLLOW_DELAY_MS,
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
      now: deps.now,
      onEach: () => {
        count++;
        state.status = `アンフォロー中… ${count} / ${targets.length}`;
        renderHeader();
      },
    });
    const done = new Set(result.done);
    state.blogs = state.blogs.filter((b) => !done.has(b.name));
    for (const name of done) state.selected.delete(name);
    await saveFollowingCache();
    state.busy = false;
    state.status =
      `${result.done.length} 件アンフォローしました` +
      (result.failed.length ? `(失敗 ${result.failed.length} 件)` : "") +
      (result.rateLimited ? "。レート制限で中断しました" : "");
    await render();
  };

  const refollow = async (
    name: string,
    url: string,
    btn: HTMLButtonElement,
  ) => {
    btn.disabled = true;
    try {
      await deps.api.follow(url);
      await dropFromHistory(deps.storage, name);
      await deps.storage.putJSON(FOLLOWING_KEY, null, 1);
      state.status = `${name} を再フォローしました。一覧には次回開いたときに反映されます`;
    } catch (e) {
      console.warn("[ees] refollow failed:", e);
      state.status = `${name} の再フォローに失敗しました`;
      btn.disabled = false;
    }
    await render();
  };

  void (async () => {
    renderHeader();
    try {
      state.protectedNames = new Set(
        (await deps.storage.getJSON<string[]>(PROTECTED_KEY)) ?? [],
      );
      state.blogs = await deps.api.following();
      await saveFollowingCache();
      for (const b of state.blogs) {
        b.oldest =
          (await deps.storage.getJSON<Oldest>(`first:${b.name}`)) ?? undefined;
      }
      state.status = `${state.blogs.length} 件`;
      state.busy = false;
      await render();
      if (state.blogs.some((b) => !b.oldest)) await runFill();
    } catch (e) {
      console.warn("[ees] curation load failed:", e);
      state.status = "フォロー一覧の取得に失敗しました";
      state.busy = false;
      renderHeader();
    }
  })();
}
