import { hri } from 'human-readable-ids';

import http from 'http';
import pump from 'pump';
import EventEmitter from 'events';
import Agent from 'events';

import TAgent from "./agent";

export class Client extends EventEmitter {
    private id: any;
    private agent: Agent;

    private graceTimeout: NodeJS.Timeout;

    constructor(options) {
        super();

        const agent = this.agent = options.agent;
        const id = this.id = options.id;

        this.graceTimeout = setTimeout(() => {
            this.close();
        }, 1000).unref();

        agent.on('online', () => {
            clearTimeout(this.graceTimeout);
        });

        agent.on('offline', () => {
            clearTimeout(this.graceTimeout);

            this.graceTimeout = setTimeout(() => {
                this.close();
            }, 1000).unref();
        });

        agent.once('error', (err) => {
            this.close();
        });
    }

    stats() {
        // @ts-ignore
        return this.agent.stats();
    }

    close() {
        clearTimeout(this.graceTimeout);

        // @ts-ignore
        this.agent.destroy();
        this.emit('close');
    }

    handleRequest(req, res) {
        const opt = {
            path: req.url,
            agent: this.agent,
            method: req.method,
            headers: req.headers
        };

        // @ts-ignore
        const clientReq = http.request(opt, (clientRes) => {
            res.writeHead(clientRes.statusCode, clientRes.headers);

            pump(clientRes, res);
        });

        clientReq.once('error', (err) => {
            // TODO(roman): if headers not sent - respond with gateway unavailable
        });

        pump(req, clientReq);
    }

    handleUpgrade(req, socket) {
        socket.once('error', (err) => {
            if (err.code == 'ECONNRESET' || err.code == 'ETIMEDOUT') {
                return;
            }
            console.error(err);
        });

        // @ts-ignore
        this.agent.createConnection({}, (err, conn) => {
            if (err) {
                socket.end();
                return;
            }

            if (!socket.readable || !socket.writable) {
                conn.destroy();
                socket.end();
                return;
            }

            const arr = [`${req.method} ${req.url} HTTP/${req.httpVersion}`];
            for (let i=0 ; i < (req.rawHeaders.length-1) ; i+=2) {
                arr.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i+1]}`);
            }

            arr.push('');
            arr.push('');

            pump(conn, socket);
            pump(socket, conn);
            conn.write(arr.join('\r\n'));
        });
    }
}

export class Manager {
    private opt: any;
    private clients: Map<String, Client> = new Map();
    private stats: any = {
        tunnels: 0
    }

    private graceTimeout = null;

    constructor(opt) {
        this.opt = opt || {};
    }

    async newClient(id) {
        const clients = this.clients;
        const stats = this.stats;

        // can't ask for id already is use
        if (clients[id]) {
            id = hri.random();
        }

        const maxSockets = this.opt.max_tcp_sockets;
        const agent = new TAgent({
            clientId: id,
            maxSockets: 10,
        });

        const client = new Client({
            id,
            agent,
        });

        clients[id] = client;

        client.once('close', () => {
            this.removeClient(id);
        });

        try {
            const info = await agent.listen();
            ++stats.tunnels;

            // @ts-ignore
            return {
                id: id,

                // @ts-ignore
                port: info.port,
                max_conn_count: maxSockets,
            };
        }
        catch (err) {
            this.removeClient(id);
            throw err;
        }
    }

    removeClient(id) {
        const client = this.clients[id];
        if (!client) {
            return;
        }
        --this.stats.tunnels;
        delete this.clients[id];
        client.close();
    }

    hasClient(id) {
        return !!this.clients[id];
    }

    getClient(id) {
        console.log(this.clients)
        return this.clients[id];
    }
}
