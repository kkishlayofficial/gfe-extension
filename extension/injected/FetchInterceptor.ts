interface JsSubmission {
  slug: string;
  code: string;
  language: string;
}

type TrpcItem = { result?: { data?: { json?: unknown } } };

function extractCorrectJsSubmission(data: unknown): JsSubmission | null {
  const items = Array.isArray(data) ? data : [data];
  const json = (items[0] as TrpcItem | undefined)?.result?.data?.json as
    | Record<string, unknown>
    | undefined;
  if (
    !json ||
    json['result'] !== 'CORRECT' ||
    typeof json['code'] !== 'string' ||
    typeof json['slug'] !== 'string'
  ) {
    return null;
  }
  return {
    slug: json['slug'] as string,
    code: json['code'] as string,
    language: typeof json['language'] === 'string' ? (json['language'] as string) : 'JS',
  };
}

export class FetchInterceptor {
  install(): void {
    const originalFetch = window.fetch.bind(window);

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const response = await originalFetch(input, init);

      const url =
        input instanceof Request
          ? input.url
          : input instanceof URL
            ? input.toString()
            : String(input);

      if (url.includes('greatfrontend.com')) {
        console.warn('[GFE Sync] GFE fetch:', url.split('?')[0]);
      }

      if (url.includes('/api/trpc/questionSubmission.javaScriptAdd')) {
        try {
          const clone = response.clone();
          const data = (await clone.json()) as unknown;
          const submission = extractCorrectJsSubmission(data);
          if (submission) {
            console.warn('[GFE Sync] CORRECT submission detected, firing GFE_JS_COMPLETE:', submission.slug);
            window.dispatchEvent(new CustomEvent('GFE_JS_COMPLETE', { detail: submission }));
          }
        } catch {
          // Swallow errors; caller still receives the original response.
        }
      } else if (url.includes('/api/trpc/questionProgress.add')) {
        if (response.ok) {
          window.dispatchEvent(new CustomEvent('GFE_COMPLETE'));
        }
      }

      return response;
    };
  }
}
