import pino from 'pino';

export const log = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  base: null,
  messageKey: 'msg',
  formatters: {
    level(label) {
      return { level: label };
    },
  },
  serializers: {
    err(value: { message?: string; name?: string }) {
      return { message: value?.message, name: value?.name };
    },
  },
  timestamp() {
    return `,"time":"${new Date().toISOString()}"`;
  },
});
