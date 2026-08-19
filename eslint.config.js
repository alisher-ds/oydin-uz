import globals from 'globals';

/**
 * Oydin lint qoidalari.
 *
 * `no-undef` bu yerdagi eng muhim qoida: aynan u `layer is not defined`
 * turidagi xatoni (blok ichida e'lon qilingan o'zgaruvchiga boshqa blokdan
 * murojaat qilish) commit qilingan zahoti ushlaydi.
 */

const shared = {
  'no-undef': 'error',
  'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
  'no-implicit-globals': 'error',
  'no-var': 'error',
  'prefer-const': 'error',
  eqeqeq: ['error', 'smart'],
  'no-console': ['warn', { allow: ['warn', 'error'] }],
  'no-alert': 'error',
  'max-len': [
    'warn',
    { code: 120, ignoreUrls: true, ignoreStrings: true, ignoreTemplateLiterals: true }
  ],
  'no-return-await': 'error',
  'require-atomic-updates': 'error',
  'no-promise-executor-return': 'error',
  'no-unsafe-optional-chaining': 'error',
  'consistent-return': 'error'
};

export default [
  {
    ignores: ['node_modules/**', '.wrangler/**', 'test-results/**', 'playwright-report/**']
  },
  {
    // Brauzerda ishlaydigan kod.
    files: ['assets/js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: globals.browser
    },
    rules: {
      ...shared,
      // `id` ga ega elementlar `window.<id>` globaliga aylanadi. Ularga
      // tasodifan tayanish K1 xatosining yarim sababi edi — taqiqlaymiz.
      'no-restricted-globals': [
        'error',
        {
          name: 'canvas',
          message: 'DOM elementini id-globalidan emas, querySelector orqali oling.'
        },
        {
          name: 'workspace',
          message: 'DOM elementini id-globalidan emas, querySelector orqali oling.'
        },
        {
          name: 'connections',
          message: 'DOM elementini id-globalidan emas, querySelector orqali oling.'
        },
        { name: 'name', message: "Global `name` o'rniga lokal o'zgaruvchi ishlating." },
        { name: 'status', message: "Global `status` o'rniga lokal o'zgaruvchi ishlating." },
        { name: 'length', message: "Global `length` o'rniga lokal o'zgaruvchi ishlating." }
      ]
    }
  },
  {
    // Brauzerdagi service worker: `clients`, `skipWaiting` kabi global'lar
    // faqat shu muhitda mavjud. Aniq belgilanmasa, `no-undef` ularni
    // xato deb ushlamaydi ham, tekshirmaydi ham.
    files: ['sw.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'script',
      globals: { ...globals.serviceworker }
    },
    rules: shared
  },
  {
    // Cloudflare Pages Functions (Workers runtime).
    files: ['functions/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.worker, ...globals.serviceworker }
    },
    rules: shared
  },
  {
    // Testlar va konfiguratsiya — Node muhiti.
    files: ['tests/**/*.js', '*.config.js', 'eslint.config.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser }
    },
    rules: { ...shared, 'no-console': 'off' }
  }
];
