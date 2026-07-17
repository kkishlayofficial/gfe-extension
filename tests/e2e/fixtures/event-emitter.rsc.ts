export function nextFPayload(): unknown[] {
  return [
    [1, JSON.stringify({
      pageProps: {
        question: {
          title: 'Event Emitter',
          slug: 'event-emitter',
          difficulty: 'medium',
          format: 'javascript',
          duration: 30,
          description: 'Build an event emitter.',
          languages: ['javascript'],
          companies: ['Google', 'Meta'],
          metadata: { url: 'https://www.greatfrontend.com/questions/javascript/event-emitter' },
        },
      },
    })],
  ];
}