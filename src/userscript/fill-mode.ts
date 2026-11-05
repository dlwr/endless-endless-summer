import { isDashboardPath, onRouteChange } from "./route";

const FILL_KEY = "ees:fill";
const FILL_CLASS = "ees-fill";

const ROOT = `html.${FILL_CLASS}`;
const IMAGE = "figure:has(> button img)";
const IMAGE_POST = `${ROOT} article:has(figure > button img)`;

// :has() は入れ子にできない。入れ子にするとルールごと無視される。
const FILL_CSS = `
${ROOT} { overflow-x: clip; }
${ROOT} [role=banner], ${ROOT} aside { display: none !important; }
${ROOT} div:has(> main) { padding: 0 !important; }
${ROOT} div:has(> div > main), ${ROOT} div:has(> div > div > main) {
  flex: 0 0 556px !important; width: 556px !important; min-width: 0 !important;
}
${ROOT} div:has(> div > div > div > main) > :not(:has(main)) { display: none !important; }
${IMAGE_POST} div:has(figure > button img) { overflow: visible !important; }
${IMAGE_POST} div:has(> figure > button img),
${IMAGE_POST} div:has(> div > figure > button img) {
  display: block !important; padding: 0 !important;
}
${IMAGE_POST} ${IMAGE} {
  display: block !important; width: 100vw !important; max-width: none !important;
  /* J で止まる位置は記事上端が y=15 になる */
  height: calc(100vh - 15px) !important;
  margin: 0 0 0 calc(50% - 50vw) !important; background: #000;
}
${IMAGE_POST} ${IMAGE} * {
  width: 100% !important; height: 100% !important; padding: 0 !important;
  max-width: none !important; max-height: none !important;
}
${IMAGE_POST} ${IMAGE} img { position: static !important; object-fit: contain !important; }
${IMAGE_POST} div:has(figure):not(:has(figure > button)):not(header *) { display: none !important; }
${IMAGE_POST} header, ${IMAGE_POST} footer {
  position: absolute !important; left: 0; right: 0; z-index: 2;
  opacity: 0; transition: opacity 0.15s; background: #fff;
}
${IMAGE_POST} header { top: 0; }
${IMAGE_POST} footer { bottom: 0; }
${IMAGE_POST}:hover header, ${IMAGE_POST}:hover footer { opacity: 1; }
`;

export function createFillMode() {
  let enabled = localStorage.getItem(FILL_KEY) === "1";
  const sync = () => {
    document.documentElement.classList.toggle(
      FILL_CLASS,
      enabled && isDashboardPath(location.pathname),
    );
  };
  const style = document.createElement("style");
  style.textContent = FILL_CSS;
  document.documentElement.append(style);
  sync();
  onRouteChange(sync);
  return {
    isEnabled: () => enabled,
    toggle: () => {
      enabled = !enabled;
      localStorage.setItem(FILL_KEY, enabled ? "1" : "0");
      sync();
    },
  };
}
