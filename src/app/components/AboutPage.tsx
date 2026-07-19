export function AboutPage() {
  return (
    <main className="about-page">
      <a className="about-back" href="/">
        ← back
      </a>
      <h1>endless endless summer — Terms &amp; Privacy</h1>
      <p>
        A dashboard that forgets what time it is. This service shows you random
        past posts from the blogs you follow on Tumblr. Operated by yuta25. Not
        affiliated with or endorsed by Tumblr.
      </p>

      <h2>Terms of Service</h2>
      <ul>
        <li>
          This is a free, experimental service provided as-is, without warranty
          of any kind. It may break, pause, or shut down at any time.
        </li>
        <li>
          You log in with your own Tumblr account via OAuth. Actions you take
          here (reblogs, likes) are performed on your Tumblr account at your
          request.
        </li>
        <li>
          Do not use this service to violate Tumblr's Terms of Service or
          Community Guidelines.
        </li>
        <li>
          The service applies rate limiting; the feed may pause when Tumblr's
          API budget runs low.
        </li>
      </ul>

      <h2>Privacy Policy</h2>
      <ul>
        <li>
          <strong>What we store:</strong> your Tumblr OAuth tokens, username,
          and blog list (to operate your session); a cached list of blogs you
          follow (up to 1 hour); per-blog sampling hints (a timestamp per blog,
          no content). All of this lives in Cloudflare KV.
        </li>
        <li>
          <strong>What we don't store:</strong> post content, browsing history,
          analytics, or tracking of any kind. No ads, no third-party trackers.
        </li>
        <li>
          <strong>Cookies:</strong> a single session cookie (30 days, HttpOnly).
          Your post-type filter preference is kept in your browser's
          localStorage only.
        </li>
        <li>
          <strong>Deleting your data:</strong> log out to delete your session
          (tokens included) immediately. You can also revoke this app's access
          at tumblr.com/settings/apps, which invalidates the stored tokens.
        </li>
        <li>
          Post content shown in the feed is fetched live from Tumblr's API and
          rendered in your browser; embedded media comes from Tumblr/third-party
          servers subject to their own policies.
        </li>
      </ul>

      <h2>Contact</h2>
      <p>
        Questions or issues:{" "}
        <a href="https://github.com/dlwr/endless-endless-summer/issues">
          GitHub Issues
        </a>
      </p>
      <p>
        Source code:{" "}
        <a href="https://github.com/dlwr/endless-endless-summer">
          github.com/dlwr/endless-endless-summer
        </a>
      </p>
    </main>
  );
}
