// 検証 D: プログラムから SPA 再遷移してタイムライン再取得を誘発できるか
(() => {
	const findLink = (href) =>
		[...document.querySelectorAll('a')].find(
			(a) => a.getAttribute('href') === href,
		);
	const dash = findLink('/dashboard');
	if (!dash) {
		console.warn('[spike] dashboard link not found');
		return;
	}
	// 一旦別ルートへ行って戻ると確実に再取得される想定。まず直接クリックを試す
	console.log('[spike] clicking dashboard link…');
	dash.click();
	setTimeout(() => {
		console.log(
			'[spike] if no timeline request fired, try: navigate to Likes then back',
		);
	}, 1500);
})();
