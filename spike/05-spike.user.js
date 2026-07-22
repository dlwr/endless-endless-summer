// ==UserScript==
// @name         endless-endless-summer spike
// @namespace    dlwr
// @match        https://www.tumblr.com/*
// @run-at       document-start
// @grant        none
// @version      0.5
// @description  Feasibility spike: can a document_start page-context hook intercept & rewrite the dashboard timeline response?
// ==/UserScript==

// 使い方(コンソール pattern: [spike]):
//   Stage 1(認証ゼロ・既定): 既存 elements を反転。並びが反転して見えれば
//     介入+書き換え+React 再描画が成立。フックが発火しなければ SW/埋め込み。
//   Stage 2(認証あり・丸ごと置換): localStorage.setItem('esSpikeStage','2') → リロード。
//     ※ page ごと置換するとページングが壊れて無限ローディングになる既知の失敗。
//   Stage 3(認証あり・先頭 prepend・診断): localStorage.setItem('esSpikeStage','3') → リロード。
//     donor を素の snake_case のまま先頭 prepend。ダッシュボードは camelCase なので
//     先頭 donor は描画されない想定(スキーマ不一致の確認用)。
//   Stage 4(認証あり・変換して prepend・本命): localStorage.setItem('esSpikeStage','4') → リロード。
//     donor を snake→camel 深変換してから先頭 prepend。変換後ポストがネイティブ描画
//     されれば全経路成立。描画されたら1件リブログして成功確認(後で削除)。
//   Stage 5(ライブ pagination ゲート): localStorage.setItem('esSpikeStage','5') → リロード。
//     毎ページ「ランダムブログ×ランダム before=」で異なる donor を取得・camel 化し、
//     elements を丸ごと置換。streamGlobalPosition を単調採番、_links.next は温存。
//     スクロールし続けて (a) 毎回新しいポストが積まれるか (b) 無限ローディングに
//     陥らないか (c) 同じポストの重複ループが起きないか を確認する。
//   戻す: localStorage.removeItem('esSpikeStage')

(() => {
	const STAGE = Number(localStorage.getItem('esSpikeStage') || '1');
	const log = (...a) => console.log('[spike]', ...a);
	log('userscript active — stage', STAGE, 'path', location.pathname);

	const origFetch = window.fetch.bind(window);
	let capturedAuth = null; // クロージャ内に留め、ログにも戻り値にも出さない
	let firedForDashboard = false;
	let donorCache = null;
	let injectedOnce = false;

	const isDash = (url) => url.includes('/api/v2/timeline/dashboard');

	const toCamel = (s) => s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
	const deepCamel = (v) => {
		if (Array.isArray(v)) return v.map(deepCamel);
		if (v && typeof v === 'object') {
			const out = {};
			for (const [k, val] of Object.entries(v)) out[toCamel(k)] = deepCamel(val);
			return out;
		}
		return v;
	};

	const jsonResponse = (body) =>
		new Response(JSON.stringify(body), {
			status: 200,
			headers: { 'Content-Type': 'application/json' },
		});

	// --- Stage 5 用: 年均等ランダムサンプリング ---
	const TUMBLR_EPOCH_S = Date.UTC(2007, 0, 1) / 1000;
	const rand = () => Math.random();
	const sampleBefore = (now) => {
		const startYear = 2007;
		const endYear = new Date(now * 1000).getUTCFullYear();
		const year = startYear + Math.floor(rand() * (endYear - startYear + 1));
		const lo = Math.max(TUMBLR_EPOCH_S, Date.UTC(year, 0, 1) / 1000);
		const hi = Math.min(now, Date.UTC(year + 1, 0, 1) / 1000 - 1);
		return Math.floor(lo + rand() * (hi - lo));
	};
	let streamPos = 0; // 単調採番カウンタ(全ページ通し)

	const fetchRandomDonor = async (h) => {
		const fRes = await origFetch(
			'https://www.tumblr.com/api/v2/user/following?limit=20',
			{ headers: h },
		);
		const blogs = (await fRes.json())?.response?.blogs || [];
		if (!blogs.length) return [];
		const now = Math.floor(Date.now() / 1000);
		const out = [];
		for (let tries = 0; tries < 8 && out.length < 8; tries++) {
			const blog = blogs[Math.floor(rand() * blogs.length)];
			const before = sampleBefore(now);
			const pRes = await origFetch(
				`https://www.tumblr.com/api/v2/blog/${blog.name}/posts?npf=true&limit=3&before=${before}`,
				{ headers: h },
			);
			const posts = (await pRes.json().catch(() => null))?.response?.posts || [];
			out.push(...posts);
		}
		return out
			.map(deepCamel)
			.map((p) => ({ ...p, streamGlobalPosition: streamPos++ }));
	};

	const fetchDonorFromBlog = async (h, name) => {
		for (const qs of ['npf=true&limit=10&before=1577836800', 'npf=true&limit=10']) {
			const pRes = await origFetch(
				`https://www.tumblr.com/api/v2/blog/${name}/posts?${qs}`,
				{ headers: h },
			);
			const pBody = await pRes.json().catch(() => null);
			const posts = pBody?.response?.posts || [];
			log('donor try', name, qs.includes('before') ? '(old)' : '(recent)', 'status', pRes.status, 'count', posts.length);
			if (posts.length) return posts;
		}
		return null;
	};

	const fetchDonor = async () => {
		if (donorCache) return donorCache;
		try {
			const h = { Authorization: capturedAuth };
			const fRes = await origFetch(
				'https://www.tumblr.com/api/v2/user/following?limit=20',
				{ headers: h },
			);
			const fBody = await fRes.json();
			const blogs = fBody?.response?.blogs || [];
			log('donor: following status', fRes.status, 'blogs', blogs.length);
			for (const blog of blogs.slice(0, 5)) {
				const posts = await fetchDonorFromBlog(h, blog.name);
				if (posts) {
					log('donor selected:', blog.name, 'posts', posts.length, 'sample keys', Object.keys(posts[0] || {}));
					donorCache = posts;
					return posts;
				}
			}
			return null;
		} catch (e) {
			log('donor error:', e && e.message);
			return null;
		}
	};

	// ダッシュボードの「本物のポスト要素」のキーを拾って snake/camel を確認する
	const logRealPostSchema = (els) => {
		const postEl =
			els.find((e) => (e.objectType || e.object_type) === 'post') ||
			els.find((e) => Object.keys(e).length > 25);
		log(
			'dashboard REAL post-element keys:',
			postEl ? Object.keys(postEl) : 'none found',
		);
	};

	window.fetch = async (input, init) => {
		const url = typeof input === 'string' ? input : (input && input.url) || '';

		if (STAGE >= 2 && url.includes('/api/v2/')) {
			const h =
				input instanceof Request ? input.headers : new Headers(init && init.headers);
			const tok = h.get('Authorization');
			// 毎回捕獲を更新(トークンローテーション対策)
			if (tok && tok !== capturedAuth) {
				const first = !capturedAuth;
				capturedAuth = tok;
				if (first) log('auth captured (kept internal)');
			}
		}

		const res = await origFetch(input, init);
		if (!isDash(url)) return res;

		try {
			const body = await res.clone().json();
			const els = body?.response?.timeline?.elements;
			if (!Array.isArray(els)) {
				log('dashboard response had no elements array');
				return res;
			}
			if (!firedForDashboard) {
				firedForDashboard = true;
				log('FIRST dashboard interception — initial paint or after scroll? note it.');
			}
			log('INTERCEPTED dashboard — elements', els.length);
			logRealPostSchema(els);

			if (STAGE === 1) {
				body.response.timeline.elements = [...els].reverse();
				log('stage 1: reversed existing elements — returning modified');
				return jsonResponse(body);
			}

			if (!capturedAuth) {
				log('stage', STAGE, ': no auth captured yet — passthrough');
				return res;
			}

			if (STAGE === 2) {
				const donor = await fetchDonor();
				if (!donor) {
					log('stage 2: donor fetch failed — passthrough');
					return res;
				}
				body.response.timeline.elements = donor;
				log('stage 2: REPLACED with donor posts', donor.length);
				return jsonResponse(body);
			}

			if (STAGE === 3 || STAGE === 4) {
				if (injectedOnce) {
					log('stage', STAGE, ': already injected once — passthrough (keep pagination)');
					return res;
				}
				const donor = await fetchDonor();
				if (!donor) {
					log('stage', STAGE, ': donor fetch failed — passthrough');
					return res;
				}
				injectedOnce = true;
				const picked = donor.slice(0, 3);
				const inject = STAGE === 4 ? picked.map(deepCamel) : picked;
				if (STAGE === 4) {
					log('stage 4: transformed donor sample keys', Object.keys(inject[0] || {}).slice(0, 12));
				}
				body.response.timeline.elements = [...inject, ...els];
				log('stage', STAGE, ': prepended 3 donor posts to', els.length, 'real elements');
				return jsonResponse(body);
			}

			if (STAGE === 5) {
				const donor = await fetchRandomDonor({ Authorization: capturedAuth });
				if (!donor.length) {
					log('stage 5: donor empty — passthrough');
					return res;
				}
				body.response.timeline.elements = donor; // _links は温存
				log('stage 5: replaced with', donor.length, 'random posts, streamPos now', streamPos);
				return jsonResponse(body);
			}

			return res;
		} catch (e) {
			log('replace failed — passthrough:', e && e.message);
			return res;
		}
	};

	log('fetch wrapped at document_start');
})();
