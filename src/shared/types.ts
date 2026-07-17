export type NpfMedia = {
  url: string;
  type?: string;
  width?: number;
  height?: number;
};
export type NpfFormatting = {
  start: number;
  end: number;
  type: string; // "bold" | "italic" | "link" | ...
  url?: string;
};
export type NpfTextBlock = {
  type: "text";
  text: string;
  subtype?: string;
  formatting?: NpfFormatting[];
};
export type NpfImageBlock = {
  type: "image";
  media: NpfMedia[];
  alt_text?: string;
};
export type NpfLinkBlock = {
  type: "link";
  url: string;
  title?: string;
  description?: string;
};
export type NpfVideoBlock = {
  type: "video";
  media?: NpfMedia;
  poster?: NpfMedia[];
  embed_iframe?: { url: string; width?: number; height?: number };
  url?: string;
};
export type NpfAudioBlock = {
  type: "audio";
  media?: NpfMedia;
  title?: string;
  artist?: string;
  url?: string;
};
export type NpfBlock =
  | NpfTextBlock
  | NpfImageBlock
  | NpfLinkBlock
  | NpfVideoBlock
  | NpfAudioBlock;

export type PostKind = "text" | "image" | "link" | "audio" | "video";

export type TrailItem = { blogName: string; content: NpfBlock[] };

export type FeedPost = {
  id: string;
  blogName: string;
  postUrl: string;
  timestamp: number;
  tags: string[];
  reblogKey: string;
  liked: boolean;
  kind: PostKind;
  content: NpfBlock[];
  trail: TrailItem[];
};

export type MeBlog = {
  name: string;
  title: string;
  primary: boolean;
  uuid: string;
};
export type Me = { userName: string; blogs: MeBlog[] };
