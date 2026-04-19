/* ============================================================
   core/cloud-config.js — Neon cloud connection config
   ============================================================
   Neon project: Dark Dimensions (proud-tree-83940290)
   Region: us-east-1 | Endpoint: ep-soft-surf-amvxla93

   authUrl:    Neon Auth endpoint (Better Auth compatible)
   dataApiUrl: Neon Data API endpoint (PostgREST-style, JWT-gated)

   Both URLs are safe to expose client-side — access is enforced
   by Row Level Security and JWT validation on the Neon side.
   ============================================================ */

window.DD_CLOUD_CONFIG = {
  authUrl:    'https://ep-soft-surf-amvxla93.auth.c-5.us-east-1.aws.neon.tech',
  dataApiUrl: 'https://ep-soft-surf-amvxla93.apirest.c-5.us-east-1.aws.neon.tech/neondb/rest/v1',
};
