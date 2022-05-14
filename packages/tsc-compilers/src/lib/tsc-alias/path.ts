import * as fs from 'fs';
import * as path from 'path';

export class PathCache {
    useCache: unknown;
    existsCache: Map<unknown, unknown>;
    absoluteCache: Map<unknown, string>;
    constructor(useCache: unknown) {
        this.useCache = useCache;
        this.existsCache = new Map();
        this.absoluteCache = new Map();
    }
    exists(path: string) {
        return (
            fs.existsSync(`${path}`) ||
            fs.existsSync(`${path}.js`) ||
            fs.existsSync(`${path}.jsx`) ||
            fs.existsSync(`${path}.cjs`) ||
            fs.existsSync(`${path}.mjs`) ||
            fs.existsSync(`${path}.d.ts`) ||
            fs.existsSync(`${path}.d.tsx`) ||
            fs.existsSync(`${path}.d.cts`) ||
            fs.existsSync(`${path}.d.mts`)
        );
    }
    existsResolvedAlias(path: string) {
        if (!this.useCache) return this.exists(path);
        if (this.existsCache.has(path)) {
            return this.existsCache.get(path);
        } else {
            const result = this.exists(path);
            this.existsCache.set(path, result);
            return result;
        }
    }
    getAAP({ basePath, aliasPath }: { basePath: string; aliasPath: string }) {
        const aliasPathParts = aliasPath
            .split('/')
            .filter(part => !part.match(/^\.$|^\s*$/));
        let aliasPathPart = aliasPathParts.shift() || '';
        let pathExists;
        while (
            !(pathExists = this.exists(path.join(basePath, aliasPathPart))) &&
            aliasPathParts.length
        ) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            aliasPathPart = aliasPathParts.shift()!;
        }
        return path.join(
            basePath,
            pathExists ? aliasPathPart : '',
            aliasPathParts.join('/')
        );
    }
    getAbsoluteAliasPath(basePath: string, aliasPath: string) {
        const request = { basePath, aliasPath };
        if (!this.useCache) return this.getAAP(request);
        if (this.absoluteCache.has(request)) {
            return this.absoluteCache.get(request);
        } else {
            const result = this.getAAP(request);
            this.absoluteCache.set(request, result);
            return result;
        }
    }
}
