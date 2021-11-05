FROM node:14-alpine3.14
WORKDIR /app
COPY package.json /app
RUN npm install && npm cache clean --force
COPY . /app
CMD node app.js
EXPOSE 3005