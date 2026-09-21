import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    '.next/**', 'out/**', 'build/**', 'next-env.d.ts',
    'supabase/legacy-migrations/**',
    'src/types/database.ts',        // مولَّد آليًا
  ]),
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      // ★ حارس أمني: العميل الخدمي يتجاوز RLS ولا يُستورد إلا في
      // مسارات النظام. يُفحص إضافيًا في CI بـgrep مستقل.
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['**/supabase/service', '@/lib/supabase/service'],
          message:
            'createServiceClient يتجاوز RLS — مسموح في api/v1/cron و api/v1/webhooks ' +
            'وطبقة المصادقة الخادمية فقط. راجع docs/API.md §12.9.',
        }],
      }],
    },
  },
  {
    files: [
      'src/app/api/v1/cron/**/*.ts',
      'src/app/api/v1/webhooks/**/*.ts',
      'src/lib/jobs/**/*.ts',
      'src/app/(platform)/(auth)/actions.ts',
      'src/lib/supabase/service.ts',
    ],
    rules: { 'no-restricted-imports': 'off' },
  },
]);
