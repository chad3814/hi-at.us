// copyright 2021 Chad Walker

const fs = require('fs').promises;

const bodyParser = require('body-parser');
const { buildSchema } = require('graphql');
const express = require('express');
const fetch = require('node-fetch');
const { graphqlHTTP } = require('express-graphql');

const RSS_URL = 'http://www.hellointernet.fm/podcast?format=json';
const TWO_MINUTES = 2 * 60 * 1000;
const ONE_DAY = 24 * 60 * 60 * 1000;
const ONE_YEAR = 365 * ONE_DAY;
const HIATUS_EP = 1582884807028;

let rss = null;
const getRssFeed = async function () {
  if (rss) {
    return rss;
  }
  rss = await fetch(RSS_URL).then(r => r.json());
  setTimeout(() => {rss = null}, TWO_MINUTES);
  return rss;
};

// Construct a schema, using GraphQL schema language
const schema = buildSchema(`
  type Query {
    getCurrentDt: Float!
    getHiatusAnniversary(years: Int!): Float!
    getLastEpisodeDt: Float!
  }
`);

// The root provides a resolver function for each API endpoint
const root = {
  getCurrentDt: async () => {
    return Date.now();
  },
  getHiatusAnniversary: async ({years}) => {
    let years_ms = years * ONE_YEAR + ONE_DAY; // 2020 was a leap year
    if (years > 4) {
        years_ms += Math.floor(years / 4) * ONE_DAY;
    }
    return HIATUS_EP + years_ms;
  },
  getLastEpisodeDt: async () => {
    const rss = await getRssFeed();
    return rss.items[0].publishOn;
  },
};  

let template;
const app = express();
app.use('/graph', bodyParser.json({limit: '1mb'}));
app.use('/graph', graphqlHTTP({
  schema: schema,
  rootValue: root,
  graphiql: true,
}));
app.get('/', async (req, res, next) => {
  if (!template) {
      template = await fs.readFile(__dirname + '/index.html', 'utf-8');
  }
  const rss = await getRssFeed();
  const last_episode_dt = rss.items[0].publishOn;
  res.end(template.replace('{{last_episode_dt}}', last_episode_dt).replace('{{current_dt}}', Date.now));
});
app.use((err, req, res, next) => {
    console.log('err:', err);
    next(err);
  });
const port = parseInt(process.argv[2], 10) || 80;
app.listen(port);
console.log(`Running a GraphQL API server at http://localhost:${port}/graph`);
