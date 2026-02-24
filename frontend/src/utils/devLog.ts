/**
 * XCron Protocol — Development Logger
 *
 * Wraps console.log/warn/error so they only output in development mode.
 * In production (xcron.io), the browser console stays clean and doesn't
 * leak internal error details to curious visitors.
 */

const isDev = import.meta.env.DEV;

export const devLog = (...args: unknown[]) => {
    if (isDev) console.log(...args);
};

export const devWarn = (...args: unknown[]) => {
    if (isDev) console.warn(...args);
};

export const devError = (...args: unknown[]) => {
    if (isDev) console.error(...args);
};
