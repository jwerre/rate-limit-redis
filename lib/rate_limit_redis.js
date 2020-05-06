const redis = require('redis');
// var crypto = require('crypto');

/**
Rate limit middleware that used redis cache

@class rateLimitRedis
@param {Object} options Rate limit options
@param {Object} options.redis Redis options (see: https://github.com/NodeRedis/node-redis#options-object-properties)
@param {String} namespace Namespace prepended to rate limit key.
@param {Number} options.timeframe  Rate limit window in seconds.
@param {Number} options.limit Maximum amount of request allowed within rate.
@param {[String]} options.whitelist A list of ip addresses where rate limit should not apply
@param {[Object]} options.customRoutes A list of routes to not apply rate limit to.
@param {String} options.customRoutes.path The path to ignore (required).
@param {String} options.customRoutes.method The request method of the ignored path (default:'GET').
@param {Boolean} options.customRoutes.ignore Whether to ignore the route all together.
@param {Number} options.customRoutes.timeframe Rate limit window for the custom route.
@param {Number} options.customRoutes.limit Maximum amount of request allowed within rate for the custom route.
@example

	app.use(
		rateLimitRedis({
			redis: {
				host: '127.0.0.1',
				port: 6379,
				path: 'ratelimit',
			},
			timeframe: 60,
			limit: 100,
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
		})
	);

*/
class RateLimitRedis {
	
	constructor(options) {
		
		this.timeframe = options.timeframe || 60,
		this.limit = options.limit || 100,
		this.namespace = options.namespace || RateLimitRedis.DEFAULT_NAMESPACE,
		this.whitelist = options.whitelist;
		this.customRoutes = options.customRoutes;
		this.redisClient = redis.createClient(options.redis);
		this._initListeners();

	}
	
	static get DEFAULT_NAMESPACE () { return 'rate-limit'; }
	
	getKey(ip, append) {
		
		let ns = ip || 'Invalid IP';
		
		if (this.namespace && this.namespace.length) {
			ns = `${this.namespace}:${ip}`;
		}
		
		if (append && append.length) {
			ns = `${ns}:${append}`;
		}
		
		return ns;

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

	setNewRequestCount (key, timeframe=this.timeframe) {
		
		return new Promise( (resolve, reject) => {

			this.redisClient.psetex(key, timeframe*1000, 1, (err, res) => {
				
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

	getTimeLeft (key, defaultTime=this.timeframe) {

		
		return new Promise( (resolve, reject) => {

			this.redisClient.pttl(key, (err, res) => {
				if (err) {
					return reject(err);
				}
				
				return resolve(res || defaultTime);
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
		
		let requestCount,
			limit = this.limit,
			timeframe = this.timeframe,
			key = this.getKey(request.ip),
			response = {
				status: 200,
			};
		
		// ignore whitelisted ips
		if ( Array.isArray(this.whitelist) && this.whitelist.length ) {
			
			if ( this.whitelist.includes(request.ip) ) {
				// delete response.limit;
				return Promise.resolve(response);

			}

		}
		
		// custome routes
		if (Array.isArray(this.customRoutes) && this.customRoutes.length) {
			
			let custom = this.customRoutes.find( (route) => {

				if (!route.hasOwnProperty('method')) {
					route.method = 'get';
				}

				return route.path === request.url ||
					route.path === request.originalUrl && 
					route.method && 
					route.method.toLowerCase() === request.method.toLowerCase();
			});

			if (custom) {

				if (custom.ignore) {
					return Promise.resolve(response);
				}
				
				let append = `${custom.method.toLowerCase() || 'get'}:${custom.path.toLowerCase()}`;

				key = this.getKey(request.ip, append);

				if (custom.limit != null) {
					limit = custom.limit;
				}

				if (custom.timeframe != null) {
					timeframe = custom.timeframe; 
				}
				
			}

		}

		// check that redis client exists
		if (!this.redisClient) {
			return Promise.reject( new Error('Unable to connect to redis') );
		}

		response.limit = limit;
		response.timeframe = timeframe;

		try {
			requestCount = await this.getRequestCount(key);
		} catch (err) {
			// ignore errors and create a new log
			// return Promise.reject(err);
			requestCount = null;
		}
		
		if (!requestCount) {
			
			try {
				await this.setNewRequestCount(key, timeframe);
			} catch (err) {
				return Promise.reject(err);
			}

			response.remaining = limit - 1;
			return Promise.resolve(response);
		}
		
		// add current request to the total count
		requestCount++;
		
		response.remaining = Math.max( limit - requestCount, 0 );
		
		// if number of requests made is greater than or equal rate limit return 429
		if (requestCount >= limit) {
			
			let ttl;
			
			try {
				ttl = await this.getTimeLeft(key, timeframe);
			} catch (err) {
				return Promise.reject(err);
			}
			
			// If ttl is -1 (has no expire), -2 (does not exist) 
			// or 0 (expired) set a new key.
			if (ttl <= 0) {

				try {
					await this.setNewRequestCount(key, timeframe);
				} catch (err) {
					return Promise.reject(err);
				}
				
				
				response.remaining = limit - 1;
				return Promise.resolve(response);

			} else {
				response.retry = Math.ceil(ttl/1000);
				response.error = new Error('Too Many Requests');
				response.status = 429;
				return Promise.resolve(response);
			}

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
