import url from 'url';
import http from 'http';
import tldjs from 'tldjs';
import { Manager } from './client';
import { hri } from 'human-readable-ids';


export default (opt: any = {}) => {
    const server = http.createServer();
    const manager = new Manager(opt);

    const validHosts = (opt.domain) ? [opt.domain] : undefined;
    const myTldjs = tldjs.fromUserSettings({ validHosts });
    const schema = opt.secure ? 'https' : 'http';

    server.on('request', async (req, res) => {
        const hostname = req.headers.host;
        const id = myTldjs.getSubdomain(hostname);

        if (id) {
            const client = manager.getClient(id);
            if (!client) {
                res.statusCode = 404;
                res.end('404');
                return;
            }

            client.handleRequest(req, res);
            return;
        }

        if (url.parse(req.url, true).query['new'] !== undefined) {
            const reqId = hri.random();
            console.log('making new client with id %s', reqId);
            const info = await manager.newClient(reqId);

            const url = schema + '://' + info.id + '.' + hostname;

            // @ts-ignore
            info.url = url;

            res.writeHead(200, {'Content-Type': 'application/json'});
            res.write(JSON.stringify(info));
            res.end();
            return;
        }
    });

    server.on("listening", () => {
        console.log(`Passagaway server listenging in: ${schema}://${opt.domain}:${opt.port}`)
    })

    return server;
}
