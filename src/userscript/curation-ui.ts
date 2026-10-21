import {
  type CurationBlog,
  filterBlogs,
  type Oldest,
  type SortKey,
  type SortOrder,
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
.ees-cur{position:fixed;inset:0;z-index:100000;background:#001935;color:#e8eef5;
  font:13px/1.4 system-ui,sans-serif;display:flex;flex-direction:column}
.ees-cur header,.ees-cur .toolbar{display:flex;gap:8px;align-items:center;
  padding:10px 16px;flex-wrap:wrap}
.ees-cur header{border-bottom:1px solid #35465c}
.ees-cur .toolbar{padding:8px 16px;background:#06213d;border-bottom:1px solid #1f3550}
.ees-cur header h2{font-size:15px;margin:0 12px 0 0}
.ees-cur .status{flex:1;color:#b8c3cf;min-width:200px}
.ees-cur button{background:#1f3550;color:#fff;border:1px solid #35465c;
  border-radius:6px;padding:5px 10px;font:inherit;cursor:pointer}
.ees-cur button:hover:not(:disabled){background:#2a4566}
.ees-cur button:disabled{opacity:.5;cursor:default}
.ees-cur button.danger{background:#a33a4a;border-color:#c2566a}
.ees-cur button.danger:hover:not(:disabled){background:#bb4558}
.ees-cur button.ghost{background:none;border-color:transparent;color:#7f8fa3;padding:2px 8px}
.ees-cur button.ghost:hover{color:#fff;border-color:#35465c;background:none}
.ees-cur tr.protected button.ghost{color:#f2c94c}
.ees-cur input[type=search]{background:#0b2440;color:#fff;border:1px solid #35465c;
  border-radius:6px;padding:5px 10px;font:inherit;width:240px}
.ees-cur input[type=search]:focus{outline:2px solid #8ec5ff;outline-offset:-1px}
.ees-cur input[type=checkbox]{width:15px;height:15px;margin:0;cursor:pointer;accent-color:#e05a6d}
.ees-cur .count{color:#b8c3cf}
.ees-cur .body{flex:1;overflow:auto}
.ees-cur table{border-collapse:collapse;width:100%}
.ees-cur th,.ees-cur td{padding:6px 10px;border-bottom:1px solid #1f3550;
  text-align:left;white-space:nowrap}
.ees-cur th{position:sticky;top:0;z-index:1;background:#0b2440;font-weight:600;color:#b8c3cf;user-select:none}
.ees-cur th.sortable{cursor:pointer}
.ees-cur th.sortable:hover{color:#fff}
.ees-cur th.sorted{color:#fff}
.ees-cur th.num,.ees-cur td.num{text-align:right}
.ees-cur td.num,.ees-cur td.date{font-variant-numeric:tabular-nums}
.ees-cur tbody tr{cursor:pointer}
.ees-cur tbody tr:hover td{background:#0b2a4a}
.ees-cur tbody tr.selected td{background:#3a1f33}
.ees-cur tbody tr.selected:hover td{background:#4a2640}
.ees-cur tr.protected{cursor:default}
.ees-cur tr.protected td{color:#7f8fa3}
.ees-cur td.muted{color:#5f7189}
.ees-cur a{color:#8ec5ff;text-decoration:none}
.ees-cur a:hover{text-decoration:underline}
.ees-cur .title{color:#b8c3cf;max-width:360px;overflow:hidden;text-overflow:ellipsis;width:100%}
.ees-cur .more{margin:12px 16px}
`;

type State = {
  blogs: CurationBlog[];
  protectedNames: Set<string>;
  selected: Set<string>;
  view: "following" | "history";
  status: string;
  busy: boolean;
  filling: boolean;
  shown: number;
  order: SortOrder;
  query: string;
  anchor: number | undefined;
};

const COLUMNS: { label: string; key?: SortKey; cls?: string }[] = [
  { label: "ブログ", key: "name" },
  { label: "タイトル" },
  { label: "最古ポスト", key: "oldest" },
  { label: "ポスト数", key: "posts", cls: "num" },
  { label: "最終ポスト", key: "updated" },
  { label: "フォロー日", key: "followedAt" },
  { label: "" },
];

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
  const toolbar = document.createElement("div");
  toolbar.className = "toolbar";
  const search = document.createElement("input");
  search.type = "search";
  search.placeholder = "ブログ名・タイトルで絞り込み";
  const count = document.createElement("span");
  count.className = "count";
  toolbar.append(search, count);
  const body = document.createElement("div");
  body.className = "body";
  root.append(header, toolbar, body);
  document.body.appendChild(root);

  const state: State = {
    blogs: [],
    protectedNames: new Set(),
    selected: new Set(),
    view: "following",
    status: "フォロー一覧を取得中…",
    busy: true,
    filling: false,
    shown: PAGE_ROWS,
    order: { key: "oldest", dir: "desc" },
    query: "",
    anchor: undefined,
  };
  let closed = false;
  search.addEventListener("input", () => {
    state.query = search.value;
    state.anchor = undefined;
    renderFollowing();
  });

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
    fetchBtn.disabled = state.busy || state.filling;
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

  const visibleBlogs = () =>
    sortCandidates(
      filterBlogs(state.blogs, state.query),
      state.protectedNames,
      state.order,
    );

  const sortBy = (key: SortKey) => {
    state.order =
      state.order.key === key
        ? { key, dir: state.order.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "name" ? "asc" : "desc" };
    state.anchor = undefined;
    renderFollowing();
  };

  const renderFollowing = () => {
    const rows = visibleBlogs();
    const shown = rows.slice(0, state.shown);
    const selectable = shown.filter((b) => !state.protectedNames.has(b.name));
    const renderCount = () => {
      count.textContent =
        `${rows.length.toLocaleString()} 件` +
        (state.selected.size ? ` ・ ${state.selected.size} 件選択中` : "");
    };
    renderCount();

    const t = document.createElement("table");
    const headRow = document.createElement("tr");
    const allCb = document.createElement("input");
    allCb.type = "checkbox";
    allCb.title = "表示中をすべて選択";
    const selectedShown = selectable.filter((b) => state.selected.has(b.name));
    allCb.checked =
      selectable.length > 0 && selectedShown.length === selectable.length;
    allCb.indeterminate = selectedShown.length > 0 && !allCb.checked;
    allCb.addEventListener("change", () => {
      for (const b of selectable) {
        if (allCb.checked) state.selected.add(b.name);
        else state.selected.delete(b.name);
      }
      renderHeader();
      renderFollowing();
    });
    const cbTh = document.createElement("th");
    cbTh.appendChild(allCb);
    headRow.appendChild(cbTh);
    for (const col of COLUMNS) {
      const th = document.createElement("th");
      if (col.cls) th.classList.add(col.cls);
      const sorted = col.key === state.order.key;
      th.textContent =
        col.label + (sorted ? (state.order.dir === "asc" ? " ▲" : " ▼") : "");
      if (col.key) {
        const key = col.key;
        th.classList.add("sortable");
        if (sorted) th.classList.add("sorted");
        th.addEventListener("click", () => sortBy(key));
      }
      headRow.appendChild(th);
    }
    t.createTHead().appendChild(headRow);

    const tbody = t.createTBody();
    const setSelected = (name: string, on: boolean) => {
      if (on) state.selected.add(name);
      else state.selected.delete(name);
    };
    shown.forEach((b, index) => {
      const isProtected = state.protectedNames.has(b.name);
      const tr = tbody.insertRow();
      if (isProtected) tr.classList.add("protected");
      if (state.selected.has(b.name)) tr.classList.add("selected");
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = state.selected.has(b.name);
      cb.disabled = isProtected;
      const toggle = (on: boolean, range: boolean) => {
        if (range && state.anchor !== undefined) {
          const [from, to] = [state.anchor, index].sort((x, y) => x - y);
          for (const r of shown.slice(from, to + 1)) {
            if (!state.protectedNames.has(r.name)) setSelected(r.name, on);
          }
          state.anchor = index;
          renderHeader();
          renderFollowing();
          return;
        }
        setSelected(b.name, on);
        state.anchor = index;
        cb.checked = on;
        tr.classList.toggle("selected", on);
        renderHeader();
        renderCount();
      };
      cb.addEventListener("click", (e) => {
        e.stopPropagation();
        toggle(cb.checked, e.shiftKey);
      });
      if (!isProtected) {
        tr.addEventListener("click", (e) => {
          if ((e.target as Element).closest("a,button")) return;
          if (e.shiftKey) e.preventDefault();
          toggle(!state.selected.has(b.name), e.shiftKey);
        });
      }
      cell(tr, cb);
      cell(tr, blogLink(b.name, b.url));
      cell(tr, b.title, "title").title = b.title;
      cell(tr, formatOldest(b.oldest), b.oldest ? "date" : "date muted");
      cell(tr, b.posts.toLocaleString(), "num");
      cell(tr, formatDate(b.updated), "date");
      cell(tr, formatDate(b.followedAt), "date");
      const protect = button(
        isProtected ? "保護中" : "保護",
        () => void toggleProtected(b.name),
        "ghost",
      );
      protect.title = isProtected
        ? "保護を解除して候補に戻す"
        : "候補から外して最下部に固定する";
      cell(tr, protect);
    });
    const scroll = body.scrollTop;
    body.replaceChildren(t);
    body.scrollTop = scroll;
    const rest = rows.length - state.shown;
    if (rest > 0) {
      const more = button(`さらに表示 (残り ${rest} 件)`, () => {
        state.shown += PAGE_ROWS;
        renderFollowing();
      });
      more.classList.add("more");
      body.appendChild(more);
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
    toolbar.style.display = state.view === "following" ? "" : "none";
    if (state.view === "following") renderFollowing();
    else await renderHistory();
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
    state.filling = true;
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
        renderHeader();
      },
    });
    for (const [name, oldest] of result.oldest) {
      const b = byName.get(name);
      if (b) b.oldest = oldest;
    }
    state.filling = false;
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
