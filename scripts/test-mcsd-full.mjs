import axios from 'axios';
import chalk from 'chalk';

const API_BASE = 'http://127.0.0.1:3010/api';

async function testEndpoint(name, url, method = 'GET', data = null) {
    console.log(chalk.blue(`\n[Testing] ${name}: ${method} ${url}`));
    try {
        const config = {
            method,
            url,
            validateStatus: () => true
        };
        if (data) config.data = data;
        
        const startTime = Date.now();
        const res = await axios(config);
        const duration = Date.now() - startTime;
        
        if (res.status >= 200 && res.status < 300) {
            console.log(chalk.green(`✅ Success [${res.status}] (${duration}ms)`));
            if (res.data.total !== undefined) console.log(`   Count: ${res.data.total}`);
            return res.data;
        } else {
            console.log(chalk.yellow(`⚠️ Warning [${res.status}]: ${JSON.stringify(res.data).substring(0, 200)}`));
            return null;
        }
    } catch (e) {
        console.log(chalk.red(`❌ Error: ${e.message}`));
        return null;
    }
}

async function run() {
    console.log(chalk.bold.magenta('\n=== mCSD FULL INTEGRATION TEST ===\n'));

    const types = [
        'Organization', 
        'Location', 
        'Practitioner', 
        'PractitionerRole', 
        'HealthcareService', 
        'Endpoint', 
        'OrganizationAffiliation'
    ];

    for (const type of types) {
        // Test 1: Search
        const searchRes = await testEndpoint(`${type} Search`, `${API_BASE}/registry/${type}`);
        
        if (searchRes && searchRes.total > 0) {
            const key = type.toLowerCase() + (type.endsWith('y') ? 'ies' : 's');
            const resources = searchRes[key] || [];
            const firstId = resources[0]?.id;

            if (firstId) {
                // Test 2: Get by ID
                await testEndpoint(`${type} Get by ID`, `${API_BASE}/registry/${type}/${firstId}`);
                
                // Test 3: Instance History
                await testEndpoint(`${type} Instance History`, `${API_BASE}/registry/${type}/${firstId}/_history`);
            }
        }
        
        // Test 4: Type History
        await testEndpoint(`${type} Type History`, `${API_BASE}/registry/${type}/_history`);
    }

    console.log(chalk.bold.magenta('\n=== TEST COMPLETE ===\n'));
}

run();
