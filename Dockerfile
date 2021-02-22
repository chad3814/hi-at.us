FROM node:14

COPY package.json yarn.lock LICENSE index.js index.html /server/
RUN yarn --cwd /server

CMD [ "node", "/server" ]
