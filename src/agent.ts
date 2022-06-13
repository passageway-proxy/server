import { Agent } from 'http';
import net from 'net';

const DEFAULT_MAX_SOCKETS = 10;

class TunnelAgent extends Agent {

    private connectedSockets: Number = 0;
    private maxTcpSockets: Number = DEFAULT_MAX_SOCKETS;

    private availableSockets: Array<any> = [];
    private waitingCreateConn: Array<any> = [];

    private server: net.Server;

    private started: Boolean = false;
    private closed: Boolean = false;


    constructor(options = {}) {
        super({
            maxFreeSockets: 1,
            keepAlive: true,
        });

        this.server = net.createServer();
    }

    stats() {
        return {
            connectedSockets: this.connectedSockets,
        };
    }

    listen() {
        const server = this.server;
        if (this.started) {
            throw new Error('already started');
        }
        this.started = true;

        server.on('close', this._onClose.bind(this));
        server.on('connection', this._onConnection.bind(this));
        server.on('error', (err: any) => {
            if (err.code == 'ECONNRESET' || err.code == 'ETIMEDOUT') {
                return;
            }

            console.log(err)
        });

        return new Promise((resolve) => {
            server.listen(() => {

                // @ts-ignore
                const port = server.address().port;
                console.log('tcp server listening on port: %d', port);

                resolve({
                    // port for lt client tcp connections
                    port: port,
                });
            });
        });
    }

    _onClose() {
        this.closed = true;
        // flush any waiting connections
        for (const conn of this.waitingCreateConn) {
            conn(new Error('closed'), null);
        }

        this.waitingCreateConn = [];

        // @ts-ignore
        this.emit('end');
    }

    // new socket connection from client for tunneling requests to client
    _onConnection(socket) {
        // no more socket connections allowed
        if (this.connectedSockets >= this.maxTcpSockets) {
            socket.destroy();
            return false;
        }

        socket.once('close', (hadError) => {

            // @ts-ignore
            this.connectedSockets -= 1;
            // remove the socket from available list
            const idx = this.availableSockets.indexOf(socket);
            if (idx >= 0) {
                this.availableSockets.splice(idx, 1);
            }

            if (this.connectedSockets <= 0) {
                // @ts-ignore
                this.emit('offline');
            }
        });

        socket.once('error', (_) => {
            socket.destroy();
        });

        if (this.connectedSockets === 0) {
            // @ts-ignore
            this.emit('online');
        }

        // @ts-ignore
        this.connectedSockets += 1;

        const fn = this.waitingCreateConn.shift();
        if (fn) {
            setTimeout(() => {
                fn(null, socket);
            }, 0);
            return;
        }

        // make socket available for those waiting on sockets
        this.availableSockets.push(socket);
    }

    createConnection(options, cb) {
        if (this.closed) {
            cb(new Error('closed'));
            return;
        }

        // socket is a tcp connection back to the user hosting the site
        const sock = this.availableSockets.shift();

        // no available sockets
        // wait until we have one
        if (!sock) {
            this.waitingCreateConn.push(cb);
            return;
        }

        cb(null, sock);
    }

    destroy() {
        this.server.close();
        super.destroy();
    }
}