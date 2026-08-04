/**
 * Content-Security-Policy.
 *
 * The origins are the ones the app actually contacts, measured rather than
 * guessed: Supabase for the API, the realtime socket and our own image bucket;
 * EA for the card art; TheSportsDB for club badges; Google for the avatar of
 * anyone who signed in. Anything else is refused.
 *
 * script-src carries 'unsafe-inline' because Next.js inlines the hydration
 * bootstrap into the document. Locking that down properly needs a per-request
 * nonce from middleware, which forces every page to render dynamically — a
 * real trade, and worth making the day this app renders text somebody else
 * wrote. It does not today: every string on screen comes from our own catalog
 * or from a display name that React escapes.
 *
 * The parts that do bite are here and cost nothing: frame-ancestors kills
 * clickjacking outright (and is what X-Frame-Options says in modern browsers),
 * object-src blocks plugin embedding, and base-uri stops an injected <base>
 * from re-pointing every relative URL on the page.
 */
const SUPABASE = 'https://*.supabase.co';
const dev = process.env.NODE_ENV === 'development';

const csp = [
  "default-src 'self'",
  // 'unsafe-eval' sólo en desarrollo: el refresco en caliente compila los
  // módulos con eval, y sin esto la página se dibuja pero ningún botón
  // responde — falla en silencio salvo por un error en la consola. La
  // compilación de producción no lo necesita, y ahí no se concede.
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''}`,
  // React writes inline style attributes, so this one is not optional.
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${SUPABASE} https://ratings-images-prod.pulse.ea.com https://r2.thesportsdb.com https://lh3.googleusercontent.com`,
  `connect-src 'self' ${SUPABASE} wss://*.supabase.co`,
  "font-src 'self' data:",
  // Sign-in navigates to Google, so it has to be an allowed form target.
  "form-action 'self' https://accounts.google.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
  'upgrade-insecure-requests',
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  // Redundant with frame-ancestors for anything current, kept for the
  // browsers and scanners that only know this one.
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Same-origin gets the full path; anyone else gets only the origin, so a
  // room code never travels in a Referer to a third party.
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // The game needs none of these, and saying so stops an embedded script from
  // ever asking on our behalf.
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  // A production build writes to the same .next the dev server is serving from,
  // which corrupts its chunks mid-session ("Cannot find module
  // './vendor-chunks/@supabase.js'"). Give each its own directory.
  distDir: process.env.NODE_ENV === 'development' ? '.next-dev' : '.next',
  // Next advertises its version in a response header; there is nothing to gain
  // from telling a scanner which release to look up.
  poweredByHeader: false,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
    ],
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

module.exports = nextConfig;
