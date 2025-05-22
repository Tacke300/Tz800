const https = require('https');
const http = require('http');
const fs = require('fs');
const crypto = require('crypto');

const apiKey = '6e61ebd4-be68-4914-a9f2-cb7de8ac189f';
const apiSecret = '4E8831FB62BA99735CD14F6BDAC0CBEF';
const passphrase = 'Altf4enter$';

function getTimestamp() {
    return new Promise((resolve, reject) => {
        https.get('https://www.okx.com/api/v5/public/time', res => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    resolve(json.data[0].ts);
                } catch (e) {
                    reject(e.message);
                }
            });
        }).on('error', reject);
    });
}

function sign(message, secret) {
    return crypto.createHmac('sha256', secret).update(message).digest('base64');
}

function getBalance(callback) {
    getTimestamp().then(timestamp => {
        const method = 'GET';
        const path = '/api/v5/account/balance';
        const prehash = `${timestamp}${method}${path}`;
        const signature = sign(prehash, apiSecret);

        const options = {
            hostname: 'www.okx.com',
            path: path,
            method: method,
            headers: {
                'OK-ACCESS-KEY': apiKey,
                'OK-ACCESS-SIGN': signature,
                'OK-ACCESS-TIMESTAMP': timestamp,
                'OK-ACCESS-PASSPHRASE': passphrase,
                'Content-Type': 'application/json'
            }
        };

        const req = https.request(options, res => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    const details = json.data[0].details;
                    callback(details);
                } catch (e) {
                    callback([]);
                }
            });
        });

        req.on('error', () => callback([]));
        req.end();
    }).catch(() => callback([]));
}

// Tạo server
http.createServer((req, res) => {
    if (req.url === '/api/balance') {
        getBalance((balances) => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(balances));
        });
    } else {
        // Trả file index.html
        fs.readFile('./index.html', (err, data) => {
            if (err) {
                res.writeHead(500);
                res.end('Lỗi đọc file');
            } else {
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(data);
            }
        });
    }
}).listen(8080, () => {
    console.log("Server chạy ở http://localhost:8080");
});
