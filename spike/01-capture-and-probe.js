// 検証 A: 内部 API がセッション認証 + 拝借ヘッダーで叩けるか
(() => {
	if (window.__spikeHooked) {
		console.log('[spike] already hooked');
		return;
	}
	window.__spikeHooked = true;
	const orig = window.fetch.bind(window);
	window.__spikeOrigFetch = orig;

	const probe = async (headers) => {
		const get = async (path) => {
			const res = await orig(`https://www.tumblr.com${path}`, { headers });
			const body = await res.json().catch(() => null);
			return { status: res.status, body };
		};
		const following = await get('/api/v2/user/following?limit=3');
		console.log('[spike] following status:', following.status);
		console.log(
			'[spike] following blogs:',
			following.body?.response?.blogs?.map((b) => b.name),
		);
		const blogName = following.body?.response?.blogs?.[0]?.name;
		if (!blogName) {
			console.warn('[spike] no blog name — following probe failed');
			return;
		}
		// before=2015-01-01T00:00:00Z 相当。過去ポストが返るか確認する
		const posts = await get(
			`/api/v2/blog/${blogName}/posts?npf=true&limit=3&before=1420070400`,
		);
		console.log('[spike] posts status:', posts.status);
		console.log(
			'[spike] posts timestamps:',
			posts.body?.response?.posts?.map((p) =>
				new Date(p.timestamp * 1000).toISOString(),
			),
		);
		console.log(
			'[spike] posts keys sample:',
			Object.keys(posts.body?.response?.posts?.[0] ?? {}),
		);
	};

	window.fetch = async (input, init) => {
		const url = typeof input === 'string' ? input : input.url;
		if (!window.__spikeHeaders && url.includes('/api/v2/')) {
			const headers =
				input instanceof Request
					? new Headers(input.headers)
					: new Headers(init?.headers);
			window.__spikeHeaders = headers;
			console.log('[spike] captured headers:', [...headers.keys()]);
			probe(headers).catch((e) => console.warn('[spike] probe failed:', e));
		}
		return orig(input, init);
	};
	console.log('[spike] fetch hooked — scroll the dashboard to trigger a request');
})();
