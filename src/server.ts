import http from 'http';
import tldjs from 'tldjs';

export default (opt: any = {}) => {
    const server = http.createServer();

    const validHosts = (opt.domain) ? [opt.domain] : undefined;
    const myTldjs = tldjs.fromUserSettings({ validHosts });

    server.on('request', (req, res) => {
        const hostname = req.headers.host;
        const id = myTldjs.getSubdomain(hostname);

        if (id) {
            console.log(id);
            return;
        }


    });

    return server;
}
