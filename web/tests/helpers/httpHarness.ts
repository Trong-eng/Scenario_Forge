import { vi } from 'vitest';

type Handler = (context: { request: Request }) => Response | Promise<Response>;

type Route = {
  method: string;
  path: string;
  handler: Handler;
};

const routes = new Map<string, Handler>();

function route(method: string, path: string, handler: Handler): Route {
  return { method, path, handler };
}

function requestFrom(input: RequestInfo | URL, init?: RequestInit): Request {
  if (input instanceof Request) return input;
  const url = typeof input === 'string' && input.startsWith('/')
    ? `http://localhost${input}`
    : input;
  return new Request(url, init);
}

export const http = {
  delete: (path: string, handler: Handler) => route('DELETE', path, handler),
  get: (path: string, handler: Handler) => route('GET', path, handler),
  patch: (path: string, handler: Handler) => route('PATCH', path, handler),
  post: (path: string, handler: Handler) => route('POST', path, handler),
};

export const HttpResponse = {
  json: (body: unknown, init?: ResponseInit) => Response.json(body, init),
};

export const server = {
  listen(): void {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = requestFrom(input, init);
      const key = `${request.method.toUpperCase()} ${new URL(request.url).pathname}`;
      const handler = routes.get(key);
      if (!handler) throw new Error(`Unhandled test request: ${key}`);
      return handler({ request });
    }));
  },
  use(...newRoutes: Route[]): void {
    for (const item of newRoutes) routes.set(`${item.method} ${item.path}`, item.handler);
  },
  resetHandlers(): void {
    routes.clear();
  },
  close(): void {
    routes.clear();
    vi.unstubAllGlobals();
  },
};
