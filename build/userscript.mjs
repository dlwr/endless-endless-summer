import { build } from "esbuild";

const banner = `// ==UserScript==
// @name         endless-endless-summer
// @namespace    dlwr
// @match        https://www.tumblr.com/*
// @run-at       document-start
// @grant        none
// @version      1.0.0
// @description  Tumblr dashboard を年均等ランダムな過去ポストに置き換える
// @homepageURL  https://github.com/dlwr/endless-endless-summer
// @supportURL   https://github.com/dlwr/endless-endless-summer/issues
// @downloadURL  https://github.com/dlwr/endless-endless-summer/releases/latest/download/endless-endless-summer.user.js
// @updateURL    https://github.com/dlwr/endless-endless-summer/releases/latest/download/endless-endless-summer.user.js
// ==/UserScript==`;

await build({
  entryPoints: ["src/userscript/main.ts"],
  bundle: true,
  format: "iife",
  target: "es2022",
  banner: { js: banner },
  outfile: "dist/endless-endless-summer.user.js",
  legalComments: "none",
});
console.log("built dist/endless-endless-summer.user.js");
