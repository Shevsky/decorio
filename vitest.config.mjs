import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    tsconfigPaths(),
    {
      configureServer(server) {
        const originalWarnOnce = server.config.logger.warnOnce;

        server.config.logger.warnOnce = (msg, options) => {
          // Пропустить определённые сообщения
          if (msg.includes('points to missing source files')) {
            return;
          }

          originalWarnOnce(msg, options);
        };
      }
    }
  ],
  test: {
    coverage: {
      include: ['src/**/*.{ts,tsx}', '!src/**/*.d.{ts,tsx}'],
      reporter: ['lcov', 'text', 'cobertura']
    },
    environment: 'node',
    globals: true,
    setupFiles: ['./vitest.setup.mjs'],
    include: ['tests/**/*.spec.{js,jsx,ts,tsx}'],
    exclude: ['node_modules']
  }
});
