import type {
  NpfAudioBlock,
  NpfBlock,
  NpfImageBlock,
  NpfLinkBlock,
  NpfTextBlock,
  NpfVideoBlock,
} from "../../shared/types";
import { applyFormatting } from "./format";

export function NpfContent({ blocks }: { blocks: NpfBlock[] }) {
  return (
    <>
      {blocks.map((block, i) => (
        // NPFブロックは安定IDを持たないため index キー
        // biome-ignore lint/suspicious/noArrayIndexKey: 順序固定の静的リスト
        <NpfBlockView key={i} block={block} />
      ))}
    </>
  );
}

function NpfBlockView({ block }: { block: NpfBlock }) {
  switch (block.type) {
    case "text":
      return <TextBlock block={block} />;
    case "image":
      return <ImageBlock block={block} />;
    case "link":
      return <LinkBlock block={block} />;
    case "video":
      return <VideoBlock block={block} />;
    case "audio":
      return <AudioBlock block={block} />;
    default:
      return null;
  }
}

function Segments({ block }: { block: NpfTextBlock }) {
  return (
    <>
      {applyFormatting(block.text, block.formatting).map((seg, i) => {
        let node = <>{seg.text}</>;
        if (seg.bold) node = <strong>{node}</strong>;
        if (seg.italic) node = <em>{node}</em>;
        if (seg.href) {
          node = (
            <a href={seg.href} target="_blank" rel="noopener noreferrer">
              {node}
            </a>
          );
        }
        // biome-ignore lint/suspicious/noArrayIndexKey: 順序固定の静的リスト
        return <span key={i}>{node}</span>;
      })}
    </>
  );
}

function TextBlock({ block }: { block: NpfTextBlock }) {
  switch (block.subtype) {
    case "heading1":
      return (
        <h2>
          <Segments block={block} />
        </h2>
      );
    case "heading2":
      return (
        <h3>
          <Segments block={block} />
        </h3>
      );
    case "quote":
    case "indented":
      return (
        <blockquote>
          <Segments block={block} />
        </blockquote>
      );
    case "chat":
      return (
        <pre className="npf-chat">
          <Segments block={block} />
        </pre>
      );
    case "ordered-list-item":
      return (
        <ol>
          <li>
            <Segments block={block} />
          </li>
        </ol>
      );
    case "unordered-list-item":
      return (
        <ul>
          <li>
            <Segments block={block} />
          </li>
        </ul>
      );
    default:
      return (
        <p>
          <Segments block={block} />
        </p>
      );
  }
}

function ImageBlock({ block }: { block: NpfImageBlock }) {
  const best = [...block.media].sort(
    (a, b) => (b.width ?? 0) - (a.width ?? 0),
  )[0];
  if (!best) return null;
  return <img src={best.url} alt={block.alt_text ?? ""} loading="lazy" />;
}

function LinkBlock({ block }: { block: NpfLinkBlock }) {
  return (
    <div className="npf-link">
      <a href={block.url} target="_blank" rel="noopener noreferrer">
        {block.title ?? block.url}
      </a>
      {block.description ? <p>{block.description}</p> : null}
    </div>
  );
}

function VideoBlock({ block }: { block: NpfVideoBlock }) {
  if (block.media?.url) {
    return (
      // biome-ignore lint/a11y/useMediaCaption: Tumblrのメディアに字幕トラックは無い
      <video controls src={block.media.url} poster={block.poster?.[0]?.url} />
    );
  }
  if (block.embed_iframe?.url) {
    return (
      <iframe
        src={block.embed_iframe.url}
        title="embedded video"
        width={block.embed_iframe.width}
        height={block.embed_iframe.height}
        allowFullScreen
      />
    );
  }
  if (block.url) {
    return (
      <a href={block.url} target="_blank" rel="noopener noreferrer">
        {block.url}
      </a>
    );
  }
  return null;
}

function AudioBlock({ block }: { block: NpfAudioBlock }) {
  const label = [block.artist, block.title].filter(Boolean).join(" — ");
  if (block.media?.url) {
    return (
      <figure className="npf-audio">
        {label ? <figcaption>{label}</figcaption> : null}
        {/* biome-ignore lint/a11y/useMediaCaption: Tumblrのメディアに字幕トラックは無い */}
        <audio controls src={block.media.url} />
      </figure>
    );
  }
  if (block.url) {
    return (
      <a href={block.url} target="_blank" rel="noopener noreferrer">
        {label || block.url}
      </a>
    );
  }
  return null;
}
