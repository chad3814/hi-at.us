FROM node:14

VOLUME [ "/storage" ]
COPY index.js /server
RUN yarn --cwd /server

CMD [ "node", "/server" ]
