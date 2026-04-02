# Stage 1: Build frontend
FROM node:24-slim AS frontend
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm install
COPY frontend/ .
RUN npm run build

# Stage 2: Build Elixir release
FROM hexpm/elixir:1.19.5-erlang-28.0-debian-bookworm-20260316-slim AS backend

RUN apt-get update -y && \
    apt-get install -y build-essential git && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN mix local.hex --force && mix local.rebar --force

ENV MIX_ENV=prod

# Install deps first (cache layer)
COPY backend/mix.exs backend/mix.lock ./
RUN mix deps.get --only prod
RUN mix deps.compile

# Copy backend source
COPY backend/ .

# Copy frontend build into Phoenix static
COPY --from=frontend /frontend/dist ./priv/static

# Compile and build release
RUN mix compile
RUN mix phx.digest
RUN mix release

# Stage 3: Runtime
FROM debian:bookworm-slim

RUN apt-get update -y && \
    apt-get install -y libstdc++6 openssl libncurses5 locales ca-certificates && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

RUN sed -i '/en_US.UTF-8/s/^# //g' /etc/locale.gen && locale-gen

ENV LANG=en_US.UTF-8
ENV LC_ALL=en_US.UTF-8

WORKDIR /app

COPY --from=backend /app/_build/prod/rel/saleflow ./

CMD ["bin/saleflow", "start"]
