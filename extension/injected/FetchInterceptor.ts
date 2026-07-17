type TrpcEnvelope = { result?: { data?: { json?: { status?: string } } } };

function isTrpcCompleted(payload: unknown): boolean {
  const record = Array.isArray(payload) ? payload[0] : payload;
  return (record as TrpcEnvelope | undefined)?.result?.data?.json?.status === 'complete';
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

      if (url.includes('/api/trpc/questionProgress.add')) {
        try {
          const clone = response.clone();
          const data = (await clone.json()) as unknown;

          if (isTrpcCompleted(data)) {
            window.dispatchEvent(new CustomEvent('GFE_COMPLETE'));
          }
        } catch {
          // Swallow non-JSON and read errors; the caller still receives the original response.
        }
      }

      return response;
    };
  }
}
