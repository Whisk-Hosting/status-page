# Builds without a Dockerfile too (Railpack); this one exists to show the shape.
FROM node:24-trixie-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
# npm's cache persists between builds, so unchanged dependencies are not downloaded again.
RUN --mount=type=cache,target=/root/.npm npm ci
COPY tsconfig.json build.mjs ./
COPY src ./src
# Each entry point becomes one file with its dependencies inside, plus the fonts beside them.
RUN npm run build

# Google's distroless Node image: Node and the libraries it needs, no shell or package manager.
FROM gcr.io/distroless/nodejs24-debian13:nonroot
# The image starts node itself; on the PATH it also runs the migrate command from whisk.yaml.
ENV PATH=/nodejs/bin:/usr/local/bin:/usr/bin:/bin
ENV NODE_ENV=production
ENV NODE_OPTIONS=--enable-source-maps
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY migrations ./migrations
USER nonroot
EXPOSE 8080
CMD ["dist/index.js"]
