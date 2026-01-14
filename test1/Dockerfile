FROM ghcr.io/puppeteer/puppeteer:latest

USER root
# Kopiujemy pliki projektu
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install
COPY . .

# Uprawnienia dla użytkownika pptruser (domyślny w tym obrazie)
RUN chown -R pptruser:pptruser /usr/src/app
USER pptruser

CMD ["node", "server.js"]
