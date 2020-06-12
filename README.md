# Rate Limit Redis

This module is a Redis based rate limiter for Node.js and Express. It is intended to be used where your web severs are distributed across multiple systems or nodes (such as in load balancing) and there needs to be a centralized location to store request counts.

## How it works

1. When a request is made a new temporary record is stored in Redis. This record is defined by the IP address of the request and will expire.
1. If a second request is made before the first expires the record count is incremented.
1. For each request made within the rate limit window the record is incremented.
1. If the record count reaches the max limit before the expiring then a 429 error status is set.

## Install

```bash
npm install --save @jwerre/rate-limit-redis
```

## Usage

```js
const rateLimitRedis = require('@jwerre/rate_limit_redis');
const app = require('express')();
const rateLimitArgs = {
	redis: {
		host: '127.0.0.1',
		port: 6379,
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

app.listen( 8080 );

```

### Alternate Usage
If you need a little more control you can instantiate the `RateLimitRedis` class yourself.

```js
const RateLimitRedis = require('@jwerre/rate_limit_redis/lib/rate_limit_redis');

const rateLimitRedis = new RateLimitRedis({
	timeframe: 60,
	limit: 120,
});

rateLimitRedis.process(httpRequest)
	.then((res) => {
		console.log(res);
	})
	.catch((err) => {
		console.error(err);
	})

```

## API
| Data Type	| Argument	| Description	|
| --		| --		| --			|
| `Object`		| `redis`	| Redis options [https://github.com/NodeRedis/node-redis#options-object-properties](more...) |
| `String`		| `namespace`	| String to prepend to the Redis key e.g.: 'rate-limit:\<USER-IP\>'. |
| `Number`		| `timeframe`	| Rate limit window in seconds. |
| `Number`		| `limit`	| Maximum amount of request allowed within timeframe. |
| `Boolean`		| `headers`	| Whether to set rate limit headers or not. |
| `[Object]`	| `customRoutes`	| A list of routes where you can set custom rate limits. This will create a new rate limit with unique key based on the ip, method and path. |
| `String`		| `customRoutes.path`	| The path to ignore (required). |
| `String`		| `customRoutes.method`	| The request method of the ignored path (default: `get`). |
| `Number`		| `customRoutes.timeframe`	| Rate limit window in seconds for custom route. |
| `Number`		| `customRoutes.limit`	| Maximum amount of request allowed within timeframe for custom route. |
| `Boolean`		| `customRoutes.ignore`	| Rate limit request to this custom route will be ignored. *Be careful with this one.* |
| `[String]`	| `whitelist`	| A list of ip addresses where rate limit should not apply. *This may be useful if you have automated tasks or health checks coming from known IPs and you don't want to apply a rate limit them.* |


## Accuracy

This module uses [Redis Expire](https://redis.io/commands/expire) to manage rate limit requests. If using Redis 2.4 or lower accuracy could be as much as 1 second off. 

## Testing

Ensure Node.js and Redis is installed and running. Then execute the following commands:

```bash
npm install
npm test
```

## Benchmark

TODO: Set up benchmark test.
