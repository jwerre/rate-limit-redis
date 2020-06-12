const assert = require('assert');
const RateLimitRedis = require('../lib/rate_limit_redis');

const TEST_IP = '192.168.0.1';
const TIMEFRAME_SEC = 2;
const RATE_LIMIT = 100;

describe('Rate Limit Redis Object Test', function() {

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
				path: '/ignore/rate/limit',
				ignore: true
			},
		],
	};
	
	const rateLimitRedis = new RateLimitRedis(options);
	
	after ( function (done)  {
		rateLimitRedis.reset( rateLimitRedis.getKey(TEST_IP) );
		rateLimitRedis.redisClient.quit(done);
	});
	

	it('should have set the correct properties', function() {

		assert.strictEqual(rateLimitRedis.timeframe, options.timeframe);
		assert.strictEqual(rateLimitRedis.limit, options.limit);
		assert.strictEqual(rateLimitRedis.namespace, options.namespace);
		assert.deepStrictEqual(rateLimitRedis.whitelist, options.whitelist);
		assert.deepStrictEqual(rateLimitRedis.customRoutes, options.customRoutes);
		
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

		assert.ok(result);
		
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
		assert.strictEqual(result.hasOwnProperty('status'), true);
		assert.strictEqual(result.hasOwnProperty('limit'), true);
		assert.strictEqual(result.hasOwnProperty('remaining'), true);
		assert.strictEqual(result.hasOwnProperty('retry'), false);
		assert.strictEqual(result.hasOwnProperty('error'), false);
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
		assert.strictEqual(result.hasOwnProperty('status'), true);
		assert.strictEqual(result.hasOwnProperty('limit'), false);
		assert.strictEqual(result.hasOwnProperty('remaining'), false);
		assert.strictEqual(result.hasOwnProperty('retry'), false);
		assert.strictEqual(result.hasOwnProperty('error'), false);
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
			
			assert.strictEqual(response.hasOwnProperty('status'), true);
			assert.strictEqual(response.hasOwnProperty('limit'), true);
			assert.strictEqual(response.hasOwnProperty('remaining'), true);
			assert.strictEqual(response.limit, RATE_LIMIT);
			assert.strictEqual(response.timeframe, TIMEFRAME_SEC);

			
			if (i < RATE_LIMIT) {
				assert.strictEqual(response.status, 200);
				assert.strictEqual(response.remaining, RATE_LIMIT-i);
				assert.strictEqual(response.hasOwnProperty('retry'), false);
				assert.strictEqual(response.hasOwnProperty('error'), false);
			} else {
				assert.strictEqual(response.status, 429);
				assert.strictEqual(response.remaining, 0);
				assert.strictEqual(response.hasOwnProperty('retry'), true);
				assert.strictEqual(response.hasOwnProperty('error'), true);
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
		assert.strictEqual(result.hasOwnProperty('status'), true);
		assert.strictEqual(result.hasOwnProperty('limit'), true);
		assert.strictEqual(result.hasOwnProperty('remaining'), true);
		assert.strictEqual(result.hasOwnProperty('retry'), true);
		assert.strictEqual(result.hasOwnProperty('error'), true);
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
					assert.strictEqual(result.hasOwnProperty('status'), true);
					assert.strictEqual(result.hasOwnProperty('limit'), true);
					assert.strictEqual(result.hasOwnProperty('remaining'), true);
					assert.strictEqual(result.hasOwnProperty('retry'), false);
					assert.strictEqual(result.hasOwnProperty('error'), false);
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
			
			assert.strictEqual(response.hasOwnProperty('status'), true);
			assert.strictEqual(response.hasOwnProperty('limit'), true);
			assert.strictEqual(response.hasOwnProperty('remaining'), true);
			assert.strictEqual(response.hasOwnProperty('timeframe'), true);
			assert.strictEqual(response.timeframe, args.timeframe);
			assert.strictEqual(response.limit, args.limit);

			if (i < args.limit) {
				assert.strictEqual(response.status, 200);
				assert.strictEqual(response.remaining, args.limit-i);
				assert.strictEqual(response.hasOwnProperty('retry'), false);
				assert.strictEqual(response.hasOwnProperty('error'), false);
			} else {
				assert.strictEqual(response.status, 429);
				assert.strictEqual(response.remaining, 0);
				assert.strictEqual(response.hasOwnProperty('retry'), true);
				assert.strictEqual(response.hasOwnProperty('error'), true);
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

		const args = options.customRoutes[1];

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
			
			assert.strictEqual(response.hasOwnProperty('limit'), false);
			assert.strictEqual(response.hasOwnProperty('remaining'), false);
			assert.strictEqual(response.hasOwnProperty('retry'), false);
			assert.strictEqual(response.hasOwnProperty('error'), false);
			assert.strictEqual(response.hasOwnProperty('status'), true);
			assert.strictEqual(response.status, 200);

		}
		
		
	});
	
	

});
