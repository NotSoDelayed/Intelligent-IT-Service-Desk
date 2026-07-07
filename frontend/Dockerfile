# ---- Base stage ----
FROM node:20-alpine AS base
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Vite bakes env vars into the JS bundle at BUILD time, not at container
# runtime -- so this has to be a build ARG, not a normal env_file entry.
# Defaults to localhost:8000 for local docker-compose use (browser runs
# on the host machine and hits the backend's mapped port directly).
ARG VITE_API_URL=http://localhost:8000
ENV VITE_API_URL=$VITE_API_URL

# ---- Dev stage ----
FROM base AS dev
EXPOSE 5173
# The --host flag ensures Vite is accessible from outside the docker container
CMD ["npm", "run", "dev", "--", "--host"]

# ---- Build stage ----
FROM base AS build
RUN npm run build

# ---- Serve stage ----
FROM nginx:alpine AS prod
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]