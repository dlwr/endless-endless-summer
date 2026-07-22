import { build } from "esbuild";

const banner = `// ==UserScript==
// @name         endless-endless-summer
// @namespace    dlwr
// @match        https://www.tumblr.com/*
// @run-at       document-start
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @version      1.0.0
// @description  Tumblr dashboard を年均等ランダムな過去ポストに置き換える
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
