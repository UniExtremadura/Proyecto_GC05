import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    include: [
      'server/tests/registration.test.js',
      'server/tests/login.test.js',
      'server/tests/profile.test.js',
      'server/tests/logout.test.js',
      'server/tests/password.test.js',
      'server/tests/recovery-tokens.test.js',
      'server/tests/recovery.test.js',
      'server/tests/recovery-mail.test.js',
      'server/tests/hallazgos.test.js',
      'server/tests/hallazgos-busqueda.test.js',
      'server/tests/gestion-hallazgos.test.js',
      'server/tests/mis-hallazgos.test.js',
      'server/tests/avisos.test.js',
      'server/tests/catalogos.test.js',
      'server/tests/catalogos-api.test.js',
      'client/src/**/*.test.jsx',
    ],
    environment: 'node',
  },
});
