export type DashboardBody = {
  response: { timeline: { elements: unknown[]; _links?: unknown } };
};

export function createPager() {
  let streamPos = 0;
  return {
    buildPage(
      original: DashboardBody,
      elements: Record<string, unknown>[],
    ): DashboardBody {
      const positioned = elements.map((el) => ({
        ...el,
        streamGlobalPosition: streamPos++,
      }));
      return {
        ...original,
        response: {
          ...original.response,
          timeline: {
            ...original.response.timeline,
            elements: positioned,
            // _links.next は温存(スクローラーが次ページを要求し続ける)
          },
        },
      };
    },
  };
}
