const assert = require('assert');
const {RateLimitRedis} = require('../lib');
const RedisClient = require('@node-redis/client/dist/lib/client').default;
const { createClient } = require('redis');

const TEST_IP = '192.168.0.1';
const TIMEFRAME_SEC = 2;
const RATE_LIMIT = 100;

describe('Rate Limit Redis Class Test', function() {

	const options = {
		// redis: {},
		timeframe: TIMEFRAME_SEC,
		limit: RATE_LIMIT,
		namespace: 'my-rate-limiter:',
		whitelist: [ '192.168.20.20' ],
		customRoutes: [
			{
				path: '/stingy/rate/limit',
				method: 'post',
				timeframe: 6,
				limit: 5,
			},
			{
				path: /^\/regex\/limit\/[0-9]{1,5}$/,
				method: 'get',
				timeframe: 60,
				limit: 25,
			},
			{
				path: '/ignore/rate/limit',
				ignore: true
			},
		],
	};
	
	const rateLimitRedis = new RateLimitRedis(options);
	
	before ( async function ()  {
		return rateLimitRedis.connect();
	});

	after ( async function ()  {
		await rateLimitRedis.reset( rateLimitRedis.getKey(TEST_IP) );
		return rateLimitRedis.disconnect();
	});

	it('should instanitate with a redis client instead of redis options', function(){
		const tlr = new RateLimitRedis( createClient(options) );
		tlr.connect();
		assert.strictEqual(tlr.redisClient instanceof RedisClient, true);
		assert.strictEqual(tlr.redisClient.isOpen, true);
		tlr.disconnect();
	});

	it('should have set the correct properties', function() {

		assert.strictEqual(rateLimitRedis.timeframe, options.timeframe);
		assert.strictEqual(rateLimitRedis.limit, options.limit);
		assert.strictEqual(rateLimitRedis.namespace, options.namespace);
		assert.deepStrictEqual(rateLimitRedis.whitelist, options.whitelist);
		assert.deepStrictEqual(rateLimitRedis.customRoutes, options.customRoutes);
		assert.strictEqual(rateLimitRedis.redisClient instanceof RedisClient, true);
		assert.strictEqual(rateLimitRedis.redisClient.isOpen, true);
		
	});

	it('should retrieve the correct key value', function() {

		assert.strictEqual(rateLimitRedis.getKey(TEST_IP), `${rateLimitRedis.namespace}:${TEST_IP}`);
		
	});

	it('should create a new request record', async function() {
		
		let result;
		
		try {
			result = await rateLimitRedis.setNewRequestCount(rateLimitRedis.getKey(TEST_IP));
		} catch (err) {
			return Promise.reject(err);
		}
		
		assert.strictEqual(result, true);
		
	});

	it('should retrieve request count', async function() {
		
		let result;
		
		try {
			result = await rateLimitRedis.getRequestCount(rateLimitRedis.getKey(TEST_IP));
		} catch (err) {
			return Promise.reject(err);
		}
		
		assert.strictEqual(result, 1);
		
	});

	it('should increment request count', async function() {
		
		let result;
		
		try {
			result = await rateLimitRedis.incrementRequestCount(rateLimitRedis.getKey(TEST_IP));
		} catch (err) {
			return Promise.reject(err);
		}
		
		assert.strictEqual(result, 2);
		
	});

	it('should retrieve time left before rate limit expires', async function() {
		
		let result;
		
		try {
			result = await rateLimitRedis.getTimeLeft(rateLimitRedis.getKey(TEST_IP));
		} catch (err) {
			return Promise.reject(err);
		}

		assert.strictEqual( !isNaN(result), true );
		assert.strictEqual( result <= TIMEFRAME_SEC*1000, true );
		assert.strictEqual( result > ( TIMEFRAME_SEC*1000 ) - 100, true );
		
	});

	it('should reset the request count', async function() {
		
		let result;
		
		try {
			result = await rateLimitRedis.reset(rateLimitRedis.getKey(TEST_IP));
		} catch (err) {
			return Promise.reject(err);
		}
		
		assert.strictEqual(result, true);
		
	});

	it('should have reset the request count', async function() {
		
		let result;
		
		try {
			result = await rateLimitRedis.getRequestCount(rateLimitRedis.getKey(TEST_IP));
		} catch (err) {
			return Promise.reject(err);
		}
		
		assert.strictEqual(result, null);
		
	});

	it('should make a single request', async function() {
		
		const request = {
			ip: TEST_IP
		};
		
		let result;

		try {
			result = await rateLimitRedis.process(request);
		} catch (err) {
			return Promise.reject(err);
		}
		
		assert.ok(result);
		assert.strictEqual('status' in result, true);
		assert.strictEqual('limit' in result, true);
		assert.strictEqual('remaining' in result, true);
		assert.strictEqual('retry' in result, false);
		assert.strictEqual('error' in result, false);
		assert.strictEqual(result.status, 200);
		assert.strictEqual(result.limit, RATE_LIMIT);
		assert.strictEqual(result.timeframe, TIMEFRAME_SEC);
		assert.strictEqual(result.remaining, RATE_LIMIT-1);
		

	});

	it('should ignore rate limit on ip', async function() {

		const request = {
			ip: options.whitelist[0],
		};
		
		let result;

		try {
			result = await rateLimitRedis.process(request);
		} catch (err) {
			return Promise.reject(err);
		}
		
		assert.ok(result);
		assert.strictEqual('status' in result, true);
		assert.strictEqual('limit' in result, false);
		assert.strictEqual('remaining' in result, false);
		assert.strictEqual('retry' in result, false);
		assert.strictEqual('error' in result, false);
		assert.strictEqual(result.status, 200);

	});

	it('should violate rate limit', async function ()  {
		
		// this.timeout(2000);
		
		try {
			await rateLimitRedis.reset(rateLimitRedis.getKey(TEST_IP));
		} catch (err) {
			return Promise.reject(err);
		}
		
		const request = {
			ip: TEST_IP
		};
		
		for (let i = 1; i <= RATE_LIMIT; i++) {

			let response;

			try {
				response = await rateLimitRedis.process(request);
			} catch (err) {
				return Promise.reject(err);
			}
			
			assert.strictEqual('status' in response, true);
			assert.strictEqual('limit' in response, true);
			assert.strictEqual('remaining' in response, true);
			assert.strictEqual(response.limit, RATE_LIMIT);
			assert.strictEqual(response.timeframe, TIMEFRAME_SEC);
			
			if (i < RATE_LIMIT) {
				assert.strictEqual(response.status, 200);
				assert.strictEqual(response.remaining, RATE_LIMIT-i);
				assert.strictEqual('retry' in response, false);
				assert.strictEqual('error' in response, false);
			} else {
				assert.strictEqual(response.status, 429);
				assert.strictEqual(response.remaining, 0);
				assert.strictEqual('retry' in response, true);
				assert.strictEqual('error' in response, true);
				assert.strictEqual( isNaN( response.retry ), false );
			}

		}
		
		
	});


	it('should fail to make a single request', async function() {
		
		const request = {
			ip: TEST_IP
		};
		
		let result;

		try {
			result = await rateLimitRedis.process(request);
		} catch (err) {
			return Promise.reject(err);
		}

		assert.ok(result);
		assert.strictEqual('status' in result, true);
		assert.strictEqual('limit' in result, true);
		assert.strictEqual('remaining' in result, true);
		assert.strictEqual('retry' in result, true);
		assert.strictEqual('error' in result, true);
		assert.strictEqual(result.limit, RATE_LIMIT);
		assert.strictEqual(result.timeframe, TIMEFRAME_SEC);
		assert.strictEqual(result.status, 429);
		assert.strictEqual(result.remaining, 0);
		assert.strictEqual( isNaN( result.retry ), false );
		

	});

	it('should make a single request after the rate limit has expires', function(done) {
		
		let timeframe = rateLimitRedis.timeframe * 1000;

		this.timeout(timeframe+100);
		
		setTimeout(function(){

			rateLimitRedis.process({ ip: TEST_IP })
				.then(function(result){
					assert.ok(result);
					assert.strictEqual('status' in result, true);
					assert.strictEqual('limit' in result, true);
					assert.strictEqual('remaining' in result, true);
					assert.strictEqual('retry' in result, false);
					assert.strictEqual('error' in result, false);
					assert.strictEqual(result.status, 200);
					assert.strictEqual(result.limit, RATE_LIMIT);
					assert.strictEqual(result.timeframe, TIMEFRAME_SEC);
					assert.strictEqual(result.remaining, RATE_LIMIT-1);
					done();
				})
				.catch(done);

		}, timeframe);
		

	});

	it('should violate a custom rate limit', async function ()  {

		
		const args = options.customRoutes[0];
		const request = {
			ip: TEST_IP,
			url: args.path,
			method: args.method,
		};
		const key = rateLimitRedis.getKey(TEST_IP, `${args.method}:${args.path}`);

		try {
			await rateLimitRedis.reset(key);
		} catch (err) {
			return Promise.reject(err);
		}

		for (let i = 1; i <= args.limit; i++) {

			let response;

			try {
				response = await rateLimitRedis.process(request);
			} catch (err) {
				return Promise.reject(err);
			}
			
			assert.strictEqual('status' in response, true);
			assert.strictEqual('limit' in response, true);
			assert.strictEqual('remaining' in response, true);
			assert.strictEqual('timeframe' in response, true);
			assert.strictEqual(response.timeframe, args.timeframe);
			assert.strictEqual(response.limit, args.limit);

			if (i < args.limit) {
				assert.strictEqual(response.status, 200);
				assert.strictEqual(response.remaining, args.limit-i);
				assert.strictEqual('retry' in response, false);
				assert.strictEqual('error' in response, false);
			} else {
				assert.strictEqual(response.status, 429);
				assert.strictEqual(response.remaining, 0);
				assert.strictEqual('retry' in response, true);
				assert.strictEqual('error' in response, true);
				assert.strictEqual( isNaN( response.retry ), false );
			}

		}
		
		
	});

	it('should violate a custom rate limit even when there is a slash at the end of the path', async function ()  {

		
		const args = options.customRoutes[0];
		const request = {
			ip: TEST_IP,
			url: args.path+'/',
			method: args.method,
		};
		const key = rateLimitRedis.getKey(TEST_IP, `${args.method}:${args.path}`);

		try {
			await rateLimitRedis.reset(key);
		} catch (err) {
			return Promise.reject(err);
		}

		for (let i = 1; i <= args.limit; i++) {

			let response;

			try {
				response = await rateLimitRedis.process(request);
			} catch (err) {
				return Promise.reject(err);
			}
			
			assert.strictEqual('status' in response, true);
			assert.strictEqual('limit' in response, true);
			assert.strictEqual('remaining' in response, true);
			assert.strictEqual('timeframe' in response, true);
			assert.strictEqual(response.timeframe, args.timeframe);
			assert.strictEqual(response.limit, args.limit);

			if (i < args.limit) {
				assert.strictEqual(response.status, 200);
				assert.strictEqual(response.remaining, args.limit-i);
				assert.strictEqual('retry' in response, false);
				assert.strictEqual('error' in response, false);
			} else {
				assert.strictEqual(response.status, 429);
				assert.strictEqual(response.remaining, 0);
				assert.strictEqual('retry' in response, true);
				assert.strictEqual('error' in response, true);
				assert.strictEqual( isNaN( response.retry ), false );
			}

		}
		
		
	});

	it('should violate a custom rate limit with regular expression path', async function ()  {

		
		const args = options.customRoutes[1];

		const request = {
			ip: TEST_IP,
			url: '/regex/limit/55555',
			method: args.method,
		};

		const key = rateLimitRedis.getKey(TEST_IP, `${args.method}:${args.path}`);

		try {
			await rateLimitRedis.reset(key);
		} catch (err) {
			return Promise.reject(err);
		}

		for (let i = 1; i <= args.limit; i++) {

			let response;

			try {
				response = await rateLimitRedis.process(request);
			} catch (err) {
				return Promise.reject(err);
			}
			
			assert.strictEqual('status' in response, true);
			assert.strictEqual('limit' in response, true);
			assert.strictEqual('remaining' in response, true);
			assert.strictEqual('timeframe' in response, true);
			assert.strictEqual(response.timeframe, args.timeframe);
			assert.strictEqual(response.limit, args.limit);

			if (i < args.limit) {
				assert.strictEqual(response.status, 200);
				assert.strictEqual(response.remaining, args.limit-i);
				assert.strictEqual('retry' in response, false);
				assert.strictEqual('error' in response, false);
			} else {
				assert.strictEqual(response.status, 429);
				assert.strictEqual(response.remaining, 0);
				assert.strictEqual('retry' in response, true);
				assert.strictEqual('error' in response, true);
				assert.strictEqual( isNaN( response.retry ), false );
			}

		}
		
		
	});


	it('should not violate rate limit since path is ignored', async function ()  {
		

		try {
			await rateLimitRedis.reset(rateLimitRedis.getKey(TEST_IP));
		} catch (err) {
			return Promise.reject(err);
		}

		const args = options.customRoutes[2];

		const request = {
			ip: TEST_IP,
			url: args.path,
			method: args.method,
		};
		
		for (let i = 1; i <= RATE_LIMIT+10; i++) {

			let response;

			try {
				response = await rateLimitRedis.process(request);
			} catch (err) {
				return Promise.reject(err);
			}
			
			assert.strictEqual('limit' in response, false);
			assert.strictEqual('remaining' in response, false);
			assert.strictEqual('retry' in response, false);
			assert.strictEqual('error' in response, false);
			assert.strictEqual('status' in response, true);
			assert.strictEqual(response.status, 200);

		}
		
		
	});
	
	

});
