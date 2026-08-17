# Keep PLAYWRIGHT_VERSION in lockstep with the installed @playwright/test version.
# Chromium ships in this image; buyers should not run npx playwright install.
ARG PLAYWRIGHT_VERSION=1.50.1
FROM mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-noble

WORKDIR /app

ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_HTML_OPEN=never
ENV ADA_SCANNER_HOST=0.0.0.0
ENV PORT=3847
ENV PLAYWRIGHT_NO_SANDBOX=1

COPY package.json package-lock.json ./
RUN npm ci --include=dev

COPY . .
RUN mkdir -p spreadsheets playwright-report \
    && npm run dashboard:build

ENV NODE_ENV=production

EXPOSE 3847

CMD ["node", "dashboard/server.js"]
