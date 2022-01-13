const RateLimitRedis = require('./rate_limit_redis');

module.exports.rateLimitRedis = async function (options) {
	
	const {headers = true} = options; 
	
	global.rateLimitRedis = new RateLimitRedis(options);

	return function (req, res, next) {
		
		global.rateLimitRedis.process( req )
			.then(function(result = {}){

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

};

module.exports.RateLimitRedis = RateLimitRedis;