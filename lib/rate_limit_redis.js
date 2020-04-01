const redis = require('redis');

/**
Rate limit middleware that used redis cache

@class rateLimitRedis
@param {Object} options Rate limit options
@param {Object} options.redis Redis options (see: https://github.com/NodeRedis/node-redis#options-object-properties)
@param {String} namespace Namespace prepended to key.
@param {Number} options.timeframe  Rate limit window in seconds.
@param {Number} options.limit Maximum amount of request allowed within rate
@param {[Object]} options.ignore A list of routes to not apply rate limit to
@param {String} options.ignore.path The path to ignore (required).
@param {String} options.ignore.method The request method of the ignored path (required).
@param {[String]} whitelist A list of hosts or ip addresses where rate limit should not apply
@example

	app.use(
		rateLimitRedis({
			redis: {
				host: '127.0.0.1',
				port: 6379,
				path: 'ratelimit',
			},
			rate: 60,
			limit: 100,
			ignore: [
				{path: '/disabled', method: 'GET'}
			]
		})
	);

*/
class RateLimitRedis {
	
	constructor(options) {
		
		this.timeframe = options.timeframe || 60,
		this.limit = options.limit || 100,
		this.namespace = options.namespace,
		this.whitelist = options.whitelist;
		this.ignore = options.ignore;
		this.redisClient = redis.createClient(options.redis);
		this._initListeners();

	}
	
	_initListeners() {
		this.redisClient.on('error', function(err) {
			if (err) {
				console.error( new Error(`RedisError: ${err.code}`) );
				
				if (Array.isArray(err.errors) && err.errors.length) {
					err.errors.forEach((item, i) => {
						console.error(item);
					});
					
				}
			}
			
		});
	}

	setNewRequestCount (key) {

		
		return new Promise( (resolve, reject) => {

			this.redisClient.setex(key, this.timeframe, 1, (err, res) => {
				
				if (err) {
					return reject(err);
				}
				
				return resolve(res === 'OK');
			});

		});

	}

	getRequestCount (key) {
		
		return new Promise( (resolve, reject) => {
			
			this.redisClient.get(key, (err, res) => {
				
				
				if (err) {
					return reject(err);
				}
				
				try {
					res = JSON.parse(res);
				} catch (err) {
					return reject(err);
				}
				
				return resolve(res);
			});

		});

	}

	incrementRequestCount (key) {

		return new Promise( (resolve, reject) => {

			this.redisClient.incr(key, (err, res) => {

				if (err) {
					return reject(err);
				}
				
				if (!res) {
					return this.setNewRequestCount(key);
				}
				
				return resolve(res);
			});

		});

	}

	getTimeLeft (key) {

		
		return new Promise( (resolve, reject) => {

			this.redisClient.ttl(key, (err, res) => {
				if (err) {
					return reject(err);
				}
				
				return resolve(res || this.timeframe);
			});

		});
	}

	reset (key) {
		
		return new Promise( (resolve, reject) => {
			
			this.redisClient.del(key, (err, res) => {
				
				if (err) {
					return reject(err);
				}
				
				return resolve(res === 1);
			});

		});

	}

	/**
	Proccess http request

	@method process
	@param {Object} request Request object
	@param {String} hostname The request host name.
	@param {String} url The url of the request.
	@param {String} originalUrl The url or the request (express style).
	@param {String} method The request method.
	@param {String} ip The ip address for the request.
	@async
	@return {Promise<Object>} Promise object returning the request response
	*/
	async process (request) {
		
		let response = {
			limit: this.limit,
			status: 200,
		};
		
		// ignore whitelisted hosts
		if ( Array.isArray(this.whitelist) && this.whitelist.length ) {
			
			if ( this.whitelist.includes(request.hostname) ||
				this.whitelist.includes(request.ip) )
			{
				delete response.limit;
				return Promise.resolve(response);
			}

		}
		
		// ignore some routes
		if (Array.isArray(this.ignore) && this.ignore.length) {
			
			let ignore = this.ignore.some( (route) => {
				return route.path === request.url ||
				route.path === request.originalUrl && 
				route.method && 
				route.method.toLowerCase() === request.method.toLowerCase();
			});

			if (ignore) {
				delete response.limit;
				return Promise.resolve(response);
			}
		}

		// check that redis client exists
		if (!this.redisClient) {
			return Promise.reject( new Error('Unable to connect to redis') );
		}

		let key, requestCount;
		
		if (this.namespace && this.namespace.length) {
			key = this.namespace + ':' + request.ip;
		} else {
			key = request.ip;
		}

		try {
			requestCount = await this.getRequestCount(key);
		} catch (err) {
			// ignore errors and create a new log
			// return Promise.reject(err);
		}
		
		if (!requestCount) {
			
			try {
				await this.setNewRequestCount(key);
			} catch (err) {
				return Promise.reject(err);
			}

			response.remaining = this.limit - 1;
			return Promise.resolve(response);
		}
		
		// add current request to the total count
		requestCount++;
		
		response.remaining = Math.max( this.limit - requestCount, 0 );
		
		// if number of requests made is greater than or equal rate limit return 429
		if (requestCount >= this.limit) {
			
			let ttl;
			
			try {
				ttl = await this.getTimeLeft(key);
			} catch (err) {
				return Promise.reject(err);
			}

			response.retry = ttl;
			response.error = new Error('Too Many Requests');
			response.status = 429;
			return Promise.resolve(response);
		}
		
		// counter may have expired at this point
		try {
			await this.incrementRequestCount(key);
		} catch (err) {
			return Promise.reject(err);
		}

		return Promise.resolve(response);

	}

}

module.exports = RateLimitRedis;
