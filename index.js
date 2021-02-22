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
const hiatus_start_times_dt = {one_day_dt: HIATUS_EP + ONE_DAY, one_month_dt: HIATUS_EP + 30 * ONE_DAY, reddit_post_dt: 1599763376330};
const parseRssForTimes = function () {
    let min = Number.POSITIVE_INFINITY;
    let min_dt;
    let max = 0;
    let max_dt;
    let total = 0;
    let count = 0;
    const spans = new Map();
    let prev_dt;
    for (const item of rss.items) {
        if (!prev_dt) {
            prev_dt = item.publishOn;
            continue;
        }
        const diff_ms = item.publishOn - prev_dt;
        prev_dt = item.publishOn;
        if (diff_ms < min) {
            min = diff_ms;
            min_dt = item.publishOn;
        }
        if (diff_ms > max) {
            max = diff_ms;
            max_dt = item.publishOn;
        }
        total += diff_ms;
        count++;
        const minute_diff = Math.round(diff_ms / 60000);
        const diff_spans = spans.get(minute_diff) ?? [];
        diff_spans.push(item.publishOn);
        spans.set(minute_diff, diff_spans);
    }
    hiatus_start_times_dt.min_dt = HIATUS_EP + min;
    hiatus_start_times_dt.min_ms = min;
    hiatus_start_times_dt.max_dt = HIATUS_EP + max;
    hiatus_start_times_dt.max_ms = max;
    hiatus_start_times_dt.mean_dt = HIATUS_EP + total / count;
    hiatus_start_times_dt.mean_ms = total / count;

    // median within a minute
    const diffs = [...spans.keys()].sort((a, b) => a - b);
    if (diffs.length % 2) {
        hiatus_start_times_dt.median_dt = HIATUS_EP + (diffs[Math.floor(diffs.length / 2)] + diffs[Math.ceil(diffs.length / 2)] / 2);
        hiatus_start_times_dt.median_ms = (diffs[Math.floor(diffs.length / 2)] + diffs[Math.ceil(diffs.length / 2)] / 2);
    } else {
        hiatus_start_times_dt.median_dt = HIATUS_EP + diffs[diffs.length / 2];
        hiatus_start_times_dt.median_ms = diffs[diffs.length / 2];
    }
};

const getRssFeed = async function () {
  if (rss) {
    return rss;
  }
  rss = await fetch(RSS_URL).then(r => r.json());
  parseRssForTimes();
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
  const vars = Object.assign({last_episode_dt: rss.items[0].publishOn, current_dt: Date.now()}, hiatus_start_times_dt);
  res.end(template.replace('{{vars}}', JSON.stringify(vars)))
  ;
});
app.use((err, req, res, next) => {
    console.log('err:', err);
    next(err);
  });
const port = parseInt(process.argv[2], 10) || 80;
app.listen(port);
console.log(`Running a GraphQL API server at http://localhost:${port}/graph`);
