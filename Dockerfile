# Callback — single-app production image.
#
# Stage 1 builds the static React client (Vite). Stage 2 is the Node/Express
# server, which serves that build at /app/client/dist AND the /api backend from
# the same origin (see server/index.js). One container, one origin, no CORS.
#
# The client's Supabase config is inlined by Vite at BUILD time, so it must be
# passed as build args. Both are safe to bake in: the URL is public and the
# PUBLISHABLE (anon) key is designed to be exposed to browsers — every row is
# protected by Supabase RLS. The SECRET key is a server-only runtime secret and
# is NEVER passed here; it's set as a Fly secret (see DEPLOY.md).

# --- Stage 1: build the static client ---------------------------------------
FROM node:22-slim AS client-build
WORKDIR /app/client

# The client's Supabase config is injected at RUNTIME by the server (from its
# env / Fly secrets), so no build args are required here — `fly deploy` needs no
# --build-arg flags. These ARGs are kept only as an optional override for
# baking values at build time; leave them unset for the normal runtime path.
ARG VITE_SUPABASE_URL=""
ARG VITE_SUPABASE_PUBLISHABLE_KEY=""
ARG VITE_API_BASE_URL=""
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY \
    VITE_API_BASE_URL=$VITE_API_BASE_URL

COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# --- Stage 2: server runtime ------------------------------------------------
FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app/server

COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev
COPY server/ ./

# Express serves this at ../client/dist (resolves to /app/client/dist).
COPY --from=client-build /app/client/dist /app/client/dist

# Fly sets $PORT; default to 8080 for a plain `docker run`.
ENV PORT=8080
EXPOSE 8080
CMD ["node", "index.js"]
