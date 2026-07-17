import "@testing-library/jest-dom/vitest";

// jsdom に無い IntersectionObserver のスタブ(無限スクロールのテスト用)
class IntersectionObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
globalThis.IntersectionObserver ??=
  IntersectionObserverStub as unknown as typeof IntersectionObserver;
