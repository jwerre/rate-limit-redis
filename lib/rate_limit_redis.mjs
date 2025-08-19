import  { createClient } from 'redis';

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
				url: 'redis://127.0.0.1:6379',
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
		
		this.redisClient;
		this.timeframe = options.timeframe || 60,
		this.limit = options.limit || 100,
		this.namespace = options.namespace || RateLimitRedis.DEFAULT_NAMESPACE,
		this.whitelist = options.whitelist;
		this.customRoutes = options.customRoutes;
		this.autoConnect = options.autoConnect || true;
		
		this._createRedisClient(options.redis);

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
	
	_createRedisClient(options={}) {

		if (options.constructor && options.constructor.name === 'Commander RedisClient') {
			
			this.redisClient = options;
			
		} else {

			this.redisClient = createClient(options);
			this.redisClient.on('error', console.error);
		}


		return this.redisClient;

	}

	async setNewRequestCount (key, timeframe=this.timeframe) {

		if (!key) {
			throw new Error('Invalid key');
		}

		let res = await this.redisClient.set(key, 1);
		await this.redisClient.expire(key, timeframe);

		return res === 'OK';

	}

	async getRequestCount (key) {

		if (!key) {
			throw new Error('Invalid key');
		}
		
		let res = await this.redisClient.get(key);
			
		return JSON.parse(res);
			
	}

	async incrementRequestCount (key) {

		if (!key) {
			throw new Error('Invalid key');
		}

		const res = await this.redisClient.incr(key);

		
		if (!res) {
			return this.setNewRequestCount(key);
		}
			
		return res;

	}

	async getTimeLeft (key, defaultTime=this.timeframe) {

		if (!key) {
			throw new Error('Invalid key');
		}

		const res = await this.redisClient.ttl(key);
			
		return res*1000 || defaultTime;

	}

	async reset (key) {

		if (!key) {
			throw new Error('Invalid key');
		}

		const res = await this.redisClient.del(key);

		return res === 1;
	}

	/**
	Process http request

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

		if ( !this.redisClient.isOpen && this.autoConnect ) {
			await this.connect();
		}
		
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
				return response;

			}

		}
		
		// custom routes
		if (Array.isArray(this.customRoutes) && this.customRoutes.length) {
			
			let custom = this.customRoutes.find( (route) => {

				if ( !( Object.prototype.hasOwnProperty.call(route, 'method') ) ) {
					route.method = 'get';
				}
				
				let samePath,
					sameMethod,
					reqPath = request.url || request.originalUrl;

				if (reqPath && reqPath.length) {

					if ( reqPath.endsWith('/') ) {
						reqPath = reqPath.slice(0, -1);
					}

					// if ( route.path.endsWith('/') ) {
					// 	route.path = route.path.slice(0, -1);
					// }

					if ( Object.prototype.toString.call(route.path) === '[object RegExp]' ) {
						samePath = route.path.test(reqPath);
					} else {
						samePath = route.path === reqPath;
					}

				}

				sameMethod = Object.prototype.toString.call(route.method) === '[object String]' &&
					Object.prototype.toString.call(request.method) === '[object String]' &&
					route.method.toLowerCase() === request.method.toLowerCase();
				
				return  samePath && sameMethod;

			});

			if (custom) {

				if (custom.ignore) {
					return response;
				}
				
				let append = `${custom.method.toLowerCase()}:${custom.path.toString().toLowerCase()}`;
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
			throw new Error('Unable to connect to redis');
		}

		response.limit = limit;
		response.timeframe = timeframe;

		requestCount = await this.getRequestCount(key);
		
		if (!requestCount) {
			
			await this.setNewRequestCount(key, timeframe);

			response.remaining = limit - 1;
			return response;
		}
		
		// add current request to the total count
		requestCount++;
		
		response.remaining = Math.max( limit - requestCount, 0 );
		
		// if number of requests made is greater than or equal rate limit return 429
		if (requestCount >= limit) {
			
			let ttl = await this.getTimeLeft(key, timeframe);
			
			// If ttl is -1 (has no expire), -2 (does not exist) 
			// or 0 (expired) set a new key.
			if (ttl <= 0) {

				await this.setNewRequestCount(key, timeframe);
				
				response.remaining = limit - 1;
				return response;

			} else {
				response.retry = Math.ceil(ttl/1000);
				response.error = new Error('Too Many Requests');
				response.status = 429;
				return response;
			}

		}
		
		// counter may have expired at this point
		await this.incrementRequestCount(key);

		return Promise.resolve(response);

	}

	/**
	Connect to Redis server

	@method connect
	@async
	@return {Promise}
	*/
	connect () {

		if (!this.redisClient) {
			throw new Error('Unable to connect to redis');
		}

		return this.redisClient.connect();

	}
	/**
	Disconnect from Redis server

	@method disconnect
	@async
	@return {Promise}
	*/
	disconnect () {

		if (!this.redisClient) {
			throw new Error('Unable to disconnect from redis');
		}

		return this.redisClient.disconnect();

	}

}


export default RateLimitRedis;
export { RateLimitRedis };