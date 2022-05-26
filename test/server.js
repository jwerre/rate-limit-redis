const assert = require('assert');
const {rateLimitRedis} = require('../lib');
const request = require('supertest');
const express = require('express');

const TEST_IP = '192.168.0.2';
const TIMEFRAME_SEC = 1;
const RATE_LIMIT = 50;
const PORT = 10358;

describe('Rate Limit Redis Server Test', function() {
	
	const app = express();
	
	const options = {
		// redis: { uri: 'redis://invalid:9999' },
		timeframe: TIMEFRAME_SEC,
		limit: RATE_LIMIT,
		// headers: true,
	};
	
	let server;

	before( async function ()  {
	
		app.enable('trust proxy');
	
		app.use( await rateLimitRedis(options) );
	
		app.get('/', (req, res) => {
			process.nextTick( () => res.send('OK') );
		});
		
		server = app.listen( PORT );
	
	});

	after(function(done){
		server.close( () => {
			global.rateLimitRedis.disconnect();
			done();
		});
	});

	it('should make requests until rate limit is reached', async function ()  {
		
		this.timeout(2000);
		
		for (let i = 1; i <= RATE_LIMIT; i++) {

			let res;

			try {
				res = await request(app)
					.get('/')
					.set('x-forwarded-for', TEST_IP);
			} catch (err) {
				return Promise.reject(err);
			}
			
			// console.log( i, res.status, res.header['x-ratelimit-remaining'] );
			
			assert.strictEqual('x-ratelimit-limit' in res.headers, true);
			assert.strictEqual('x-ratelimit-remaining' in res.headers, true);
			assert.strictEqual( parseInt( res.headers['x-ratelimit-limit'] )
				, RATE_LIMIT);

			
			if (i < RATE_LIMIT) {

				assert.strictEqual(res.status, 200, 
					`Status code should be 200 but got ${res.status}. \
This is likely due to running the test multiple times without letting the \
cache expire. Run the test again in ${TIMEFRAME_SEC} second(s)`);
				assert.strictEqual( parseInt( res.headers['x-ratelimit-remaining'] )
					, RATE_LIMIT-i );

			} else {
				assert.strictEqual(res.status, 429);
				assert.strictEqual( parseInt( res.headers['x-ratelimit-remaining'] )
					, 0 );
				assert.strictEqual('retry-after' in res.headers, true);
				assert.strictEqual( isNaN( res.headers['retry-after'] ), false );
			}

		}		
		
	});

	

});
