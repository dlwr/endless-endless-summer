// 検証 B: dashboard レスポンスに他ブログの過去ポストを混ぜて描画・リブログできるか
(() => {
	const orig = window.__spikeOrigFetch ?? window.fetch.bind(window);
	const headers = window.__spikeHeaders;
	if (!headers) {
		console.warn('[spike] run 01-capture-and-probe.js first (need captured headers)');
		return;
	}

	const fetchDonorPosts = async () => {
		const fRes = await orig('https://www.tumblr.com/api/v2/user/following?limit=20', {
			headers,
		});
		const fBody = await fRes.json();
		const blogs = fBody.response.blogs;
		const blog = blogs[Math.floor(blogs.length / 2)]; // 適当に1ブログ選ぶ
		const pRes = await orig(
			`https://www.tumblr.com/api/v2/blog/${blog.name}/posts?npf=true&limit=10&before=1577836800`,
			{ headers },
		);
		const pBody = await pRes.json();
		console.log('[spike] donor blog:', blog.name, 'posts:', pBody.response.posts.length);
		return pBody.response.posts;
	};

	window.fetch = async (input, init) => {
		const url = typeof input === 'string' ? input : input.url;
		const res = await orig(input, init);
		if (!url.includes('/api/v2/timeline/dashboard')) return res;
		try {
			const body = await res.clone().json();
			const donor = await fetchDonorPosts();
			const original = body.response.timeline.elements;
			console.log(
				'[spike] original element sample keys:',
				Object.keys(original?.[0] ?? {}),
			);
			body.response.timeline.elements = donor;
			console.log('[spike] REPLACED timeline elements:', donor.length);
			return new Response(JSON.stringify(body), {
				status: res.status,
				statusText: res.statusText,
				headers: res.headers,
			});
		} catch (e) {
			console.warn('[spike] replace failed — passthrough:', e);
			return res;
		}
	};
	console.log('[spike] replace hook armed — re-navigate to dashboard to trigger');
})();
