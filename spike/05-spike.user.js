// ==UserScript==
// @name         endless-endless-summer spike
// @namespace    dlwr
// @match        https://www.tumblr.com/*
// @run-at       document-start
// @grant        none
// @version      0.3
// @description  Feasibility spike: can a document_start page-context hook intercept & rewrite the dashboard timeline response?
// ==/UserScript==

// 使い方(コンソール pattern: [spike]):
//   Stage 1(認証ゼロ・既定): 既存 elements を反転。並びが反転して見えれば
//     介入+書き換え+React 再描画が成立。フックが発火しなければ SW/埋め込み。
//   Stage 2(認証あり・丸ごと置換): localStorage.setItem('esSpikeStage','2') → リロード。
//     ※ page ごと置換するとページングが壊れて無限ローディングになる既知の失敗。
//   Stage 3(認証あり・先頭 prepend・診断本命): localStorage.setItem('esSpikeStage','3') → リロード。
//     初回レスポンスにだけ donor を数件 prepend し、以降は素通り(_links 温存)。
//     本物ポストに混ざって donor が描画されるか=スキーマ互換性を切り分ける。
//     同時に本物ポスト要素のキーもログして snake/camel を直接比較する。
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

	const jsonResponse = (body) =>
		new Response(JSON.stringify(body), {
			status: 200,
			headers: { 'Content-Type': 'application/json' },
		});

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

		if (STAGE >= 2 && !capturedAuth && url.includes('/api/v2/')) {
			const h =
				input instanceof Request ? input.headers : new Headers(init && init.headers);
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

			if (STAGE === 3) {
				if (injectedOnce) {
					log('stage 3: already injected once — passthrough (keep pagination)');
					return res;
				}
				const donor = await fetchDonor();
				if (!donor) {
					log('stage 3: donor fetch failed — passthrough');
					return res;
				}
				injectedOnce = true;
				body.response.timeline.elements = [...donor.slice(0, 3), ...els];
				log('stage 3: prepended 3 donor posts to', els.length, 'real elements');
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
