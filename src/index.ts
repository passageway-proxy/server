import createServer from "./server";

const main = () => {
    const server = createServer();

    server.listen(3000, "vcap.me")
}

main()
