import { RateLimitRedis } from './rate_limit_redis.mjs';

export async function rateLimitRedis(options) {
	const { headers = true } = options;

	global.rateLimitRedis = new RateLimitRedis(options);

	return function (req, res, next) {
		global.rateLimitRedis
			.process(req)
			.then(function (result = {}) {
				if (headers) {
					res.set('x-ratelimit-limit', result.limit);
					res.set('x-ratelimit-remaining', result.remaining);
					res.set('retry-after', result.retry);
				}

				res.status(result.status);
				next();
			})
			.catch(next);
	};
}

export default RateLimitRedis;
export { RateLimitRedis };
