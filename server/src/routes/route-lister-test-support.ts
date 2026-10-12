import type { Router } from 'express';

interface Layer {
  route?: { path: string; methods: Record<string, boolean> };
  handle?: { stack?: Layer[] };
}

/** Lists the `METHOD /path` of every route a router holds, including routers nested without a prefix. */
export class RouteLister {
  list(router: Router): string[] {
    return this.walk((router as unknown as { stack: Layer[] }).stack).sort();
  }

  private walk(stack: Layer[]): string[] {
    const found: string[] = [];
    for (const layer of stack) {
      if (layer.route) {
        for (const method of Object.keys(layer.route.methods)) {
          found.push(`${method.toUpperCase()} ${layer.route.path}`);
        }
      } else if (layer.handle?.stack) {
        found.push(...this.walk(layer.handle.stack));
      }
    }
    return found;
  }
}
