type LogData = Record<string, unknown>;

const isProd = (): boolean => import.meta.env.PROD === true;

export const logger = {
  debug(event: string, data?: LogData): void {
    if (isProd()) return;
    // eslint-disable-next-line no-console
    console.log(`[GFE Sync] debug: ${event}`, data);
  },
  info(event: string, data?: LogData): void {
    if (isProd()) return;
    // eslint-disable-next-line no-console
    console.log(`[GFE Sync] info: ${event}`, data);
  },
  warn(event: string, data?: LogData): void {
    console.warn(`[GFE Sync] warn: ${event}`, data);
  },
  error(event: string, data?: LogData): void {
    console.error(`[GFE Sync] error: ${event}`, data);
  },
};
