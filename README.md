# Rate Limit Redis

This module is a Redis based rate limiter for Node.js and Express. It is intended to be used where your web severs are distributed across multiple systems or nodes (such as in load balancing) and there needs to be a centralized location to store request counts.

## How it works

1. When a request is made, a new temporary record is stored in Redis. This record is defined by the IP address of the request and will expire.
1. If a second request is made before the first expires, the record count is incremented.
1. For each request made within the rate limit window, the record is incremented.
1. If the record count reaches the max limit before expiring, then a 429 error status is returned.

## Install

```bash
npm install --save @jwerre/rate-limit-redis
```

## Usage

```js
const {rateLimitRedis} = require('@jwerre/rate_limit_redis');
const app = require('express')();
const rateLimitArgs = {
  redis: {
    url: 'redis://127.0.0.1:6379',
  },
  timeframe: 60,
  limit: 120,
  headers: true,
  whitelist: [ '192.168.20.20' ],
  customRoutes: [
    {
      path: '/stingy/rate/limit',
      method: 'POST',
      timeframe: 30,
      limit: 5,
    },
    {
      path: '/loose/rate/limit',
      method: 'PUT',
      timeframe: 120,
      limit: 500,
    {
      path: /^\/regex\/[0-9]{5,10}\/?$/,
      method: 'GET',
      timeframe: 60,
      limit: 25,
    },
    {
      path: '/ignore/rate/limit',
      method: 'GET',
      ignore: true
    },
  ]
};

// use trust proxy if behind load balancer
app.enable('trust proxy');

app.use( rateLimitRedis(rateLimitArgs) );

app.get('/', (req, res) => { res.send('OK') ); });

const server = app.listen( 8080 );

server.on('error', () => {
  // rateLimitRedis is added to Node's global scope 
  // (https://nodejs.org/docs/latest-v14.x/api/globals.html) so you can close 
  // the connection properly
  global.rateLimitRedis.disconnect();
});

```

### Alternate Usage

If you need a little more control, you can instantiate the `RateLimitRedis` class yourself.

```js
const {RateLimitRedis} = require('@jwerre/rate-limit-redis');

const rateLimitRedis = new RateLimitRedis({
  redis: {
    // see: https://github.com/redis/node-redis/blob/master/docs/client-configuration.md
    socket: {
      host: 'localhost',
      port: 6379,
    }
  },
  timeframe: 60,
  limit: 120,
  autoConnect: false,
});

rateLimitRedis.connect().then( () => {

  rateLimitRedis.process(<SOME_HTTP_REQUEST>)
    .then((res) => {
      console.log(res);
    })
    .catch((err) => {
      console.error(err);
    })

});


```

## Arguments

| Data Type | Argument | Description |
| --  | --  | --   |
| `Object`  | `redis` | Redis options [https://github.com/redis/node-redis/blob/master/docs/client-configuration.md](more...) |
| `String`  | `namespace` | String to prepend to the Redis key e.g.: 'rate-limit:\<USER-IP\>'. |
| `Number`  | `timeframe` | Rate limit window in seconds. |
| `Number`  | `limit` | Maximum amount of requests allowed within timeframe. |
| `Boolean`  | `headers` | Whether to set rate limit headers or not. |
| `Boolean`  | `autoConnect` | Whether to automaitcally connect to redis before proccess http request (default: true). |
| `[String]` | `whitelist` | A list of IP addresses where rate limit should not apply. *This may be useful if you have automated tasks, probes or health checks coming from known IPs and you don't want to apply a rate limit to them.* |
| `[Object]` | `customRoutes` | A list of routes where you can set custom rate limits. This will create a new rate limit with a unique key based on the IP, method and path. |
| `String\|RegExp`| `customRoutes.path` | The path to ignore (required). *Note: Do not user trailing slash.*|
| `String`  | `customRoutes.method` | The request method of the ignored path (default: `get`). |
| `Number`  | `customRoutes.timeframe` | Rate limit window in seconds for custom route. |
| `Number`  | `customRoutes.limit` | Maximum amount of requests allowed within timeframe for custom route. |
| `Boolean`  | `customRoutes.ignore` | Rate limit request to this custom route will be ignored. *Be careful with this one.* |

## Methods

### `process(request)`

Process HTTP request.

#### Argumements

[HTTP request](https://nodejs.org/docs/latest-v14.x/api/http.html#http_class_http_clientrequest): The http request to rate limit

#### Returns

`Promise`: Object containing rate limit information e.g.:

```js
{
  status: 200,
  limit: 100,
  timeframe: 2,
  remaining: 99,
  retry: Number // if status is 429
  error: Error // if status is 429
}
```

### `disconnect()`

Close redis connection.

#### Returns

`Promise`

## Accuracy

This module uses [Redis Expire](https://redis.io/commands/expire) to manage rate limit requests. If using Redis 2.4 or lower, accuracy could be as much as 1 second off.

## Testing

Ensure Node.js and Redis are installed and running. Then execute the following commands:

```bash
npm install
npm test
```

## Benchmark

TODO: Set up benchmark test.
