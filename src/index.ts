import createServer from "./server";

const main = () => {
    const server_info = {
        port: 3000,
        host: "vcap.me"
    }

    const server = createServer({
        domain: server_info.host,
        port: server_info.port
    });

    server.listen(server_info.port, server_info.host)
}

main()
