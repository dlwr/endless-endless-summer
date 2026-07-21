// ==UserScript==
// @name         endless-endless-summer spike
// @namespace    dlwr
// @match        https://www.tumblr.com/*
// @run-at       document-start
// @grant        none
// @version      0.2
// @description  Feasibility spike: can a document_start page-context hook intercept & rewrite the dashboard timeline response?
// ==/UserScript==

// 使い方:
//   Stage 1(認証ゼロ・既定): インストールして tumblr.com/dashboard を開く。
//     コンソール(pattern: [spike])を確認。既存ポストの並び順が反転して見えれば
//     「介入 + レスポンス書き換え + React 再描画」が成立。フックが一度も発火しなければ
//     タイムライン取得は Service Worker 発 or サーバー埋め込み → 設計に重大影響。
//   Stage 2(認証あり): コンソールで localStorage.setItem('esSpikeStage','2') → リロード。
//     フォロー中ブログの過去ポストを取得して丸ごと置換する。描画されたらリブログを手動で試す。
//   戻す: localStorage.removeItem('esSpikeStage')

(() => {
	const STAGE = Number(localStorage.getItem('esSpikeStage') || '1');
	const log = (...a) => console.log('[spike]', ...a);
	log('userscript active — stage', STAGE, 'path', location.pathname);

	const origFetch = window.fetch.bind(window);
	let capturedAuth = null; // クロージャ内に留め、ログにも戻り値にも出さない
	let firedForDashboard = false;

	const isDash = (url) => url.includes('/api/v2/timeline/dashboard');

	const jsonResponse = (body) =>
		new Response(JSON.stringify(body), {
			status: 200,
			headers: { 'Content-Type': 'application/json' },
		});

	const fetchDonorFromBlog = async (h, name) => {
		// まず before=2020-01-01 で古いポストを狙い、空なら before なし(最新)で再試行
		for (const qs of [
			'npf=true&limit=10&before=1577836800',
			'npf=true&limit=10',
		]) {
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
		try {
			const h = { Authorization: capturedAuth };
			const fRes = await origFetch(
				'https://www.tumblr.com/api/v2/user/following?limit=20',
				{ headers: h },
			);
			const fBody = await fRes.json();
			const blogs = fBody?.response?.blogs || [];
			log('donor: following status', fRes.status, 'blogs', blogs.length);
			// ポストが取れるまで最大5ブログ試す
			for (const blog of blogs.slice(0, 5)) {
				const posts = await fetchDonorFromBlog(h, blog.name);
				if (posts) {
					log('donor selected:', blog.name, 'posts', posts.length, 'sample keys', Object.keys(posts[0] || {}));
					return posts;
				}
			}
			return null;
		} catch (e) {
			log('donor error:', e && e.message);
			return null;
		}
	};

	window.fetch = async (input, init) => {
		const url = typeof input === 'string' ? input : (input && input.url) || '';

		if (STAGE >= 2 && !capturedAuth && url.includes('/api/v2/')) {
			const h =
				input instanceof Request
					? input.headers
					: new Headers(init && init.headers);
			if (h.get('Authorization')) {
				capturedAuth = h.get('Authorization');
				log('auth captured (kept internal)');
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
				log(
					'FIRST dashboard interception — was this the initial page paint or after scroll? note it.',
				);
			}
			log(
				'INTERCEPTED dashboard — elements',
				els.length,
				'sample keys',
				Object.keys(els[0] || {}),
			);

			if (STAGE === 1) {
				body.response.timeline.elements = [...els].reverse();
				log('stage 1: reversed existing elements (no credentials) — returning modified');
				return jsonResponse(body);
			}

			if (!capturedAuth) {
				log('stage 2: no auth captured yet — passthrough');
				return res;
			}
			const donor = await fetchDonor();
			if (!donor) {
				log('stage 2: donor fetch failed — passthrough');
				return res;
			}
			body.response.timeline.elements = donor;
			log('stage 2: REPLACED with donor posts', donor.length);
			return jsonResponse(body);
		} catch (e) {
			log('replace failed — passthrough:', e && e.message);
			return res;
		}
	};

	log('fetch wrapped at document_start');
})();
