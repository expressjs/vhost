import * as http from "http"

declare namespace vhost {
  interface RequestHandler {
    (req: http.IncomingMessage, res: http.ServerResponse, next: Function): void
  }
}

declare function vhost(hostname: string | RegExp, handle: vhost.RequestHandler): vhost.RequestHandler

declare module "http" {
  interface IVHost {
    [key: number]: string
    host: string,
    hostname: string,
    length: number
  }

  interface IncomingMessage {
    vhost: IVHost
  }
}

export = vhost
