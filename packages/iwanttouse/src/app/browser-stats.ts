const intersectionOf = arrays => {
    if (arrays.length == 1) return [...new Set(arrays[0])];
    if (arrays.length < 2) throw 'not enough inputs';

    arrays.sort((a, b) => {
        if (a.length > b.length) return 1;
        if (a.length < b.length) return -1;
        return 0;
    });

    const output = new Set(arrays[0]);
    for (let i = 1; i < arrays.length; i++) {
        const values = output.values();
        for (const val of values) {
            if (arrays[i].indexOf(val) == -1) output.delete(val);
        }
    }

    return [...output];
};

const groupBy = <T>(
    array: T[],
    func: (T) => string | number
): Record<string | number, T[]> => {
    const output = {};
    for (const item of array) {
        const key = func(item);
        if (key in output == false) {
            output[key] = [];
        }
        output[key].push(item);
    }
    return output;
};

type Agent = {
    browser: unknown;
    share: unknown;
    type: unknown;
    versions: Record<string, unknown>;
    usage_global: Record<string, number>;
};

class Browser {
    agent: Agent;
    key: unknown;
    _totalShare: unknown;

    constructor(key, agent) {
        this.agent = agent;
        this.key = key;
        this._totalShare = Object.values(agent.usage_global).reduce(
            (memo: number, num: number) => memo + num,
            0
        );
    }

    get browser() {
        return this.agent.browser;
    }

    get share() {
        return this.agent.share;
    }

    get type() {
        return this.agent.type;
    }

    get versionKeys() {
        const versions = [];
        for (const v in this.agent.versions) {
            if (this.agent.versions[v]) {
                versions.push(this.key + '+' + this.agent.versions[v]);
            }
        }
        return versions;
    }

    get totalShare() {
        return this._totalShare;
    }

    getVersionShare(version) {
        return this.agent.usage_global[version] || 0;
    }
}

class Browsers {
    _agents: Record<string, Browser>;
    _features: Record<
        string,
        {
            stats: Record<string, Record<string, string>>;
        }
    >;

    constructor() {
        this._agents = {};
        this._features = {};
    }

    get features() {
        return this._features;
    }

    addBrowser(a, agent) {
        this._agents[a] = new Browser(a, agent);
    }

    getBrowser(key) {
        const ua = key.split('+');
        const agent = this._agents[ua[0]];
        return {
            key: key,
            version: ua[1],
            type: agent.type,
            name: agent.browser,
            browserShare: agent.getVersionShare(ua[1]),
        };
    }

    addFeature(feature, versions) {
        this._features[feature] = versions;
    }

    getByFeature(features, states) {
        const output = [];
        if (!!features == false || features.length === 0) {
            // get every single browser and version
            let agents = [];
            for (const a in this._agents) {
                agents = agents.concat(this._agents[a].versionKeys);
            }
            output.push(agents);
        } else {
            for (const featureName of features) {
                output[featureName] = [];
                const feature = this._features[featureName];
                for (const b in feature.stats) {
                    for (const v in feature.stats[b]) {
                        let present = feature.stats[b][v];
                        // remove notes
                        present = present.replace(/ #.*/, '');
                        if (states.indexOf(present) > -1) {
                            output[featureName].push(b + '+' + v);
                        }
                    }
                }
            }
        }

        const browser_vers = intersectionOf(Object.values(output));
        return browser_vers.map(i => this.getBrowser(i));
    }

    browsersByFeature(features, states) {
        return this.featuresByProperty(features, states, 'name');
    }

    typesByFeature(features, states) {
        return this.featuresByProperty(features, states, 'type');
    }

    featuresByProperty(features, states, property) {
        const supportedBy = this.getByFeature(features, states);
        const browserSupport = groupBy(supportedBy, i => {
            return i[property];
        });
        return Object.values(browserSupport).map(i => {
            const versions = i.map(r => {
                const version = Number.parseFloat(r.version);
                if (Number.isNaN(version)) {
                    return Infinity;
                }
                return version;
            });

            return {
                name: i[0][property],
                versions: versions,
                since: Math.min(...versions), // sometimes the version is not a number..
                share: i.reduce((memo, r) => memo + r.browserShare, 0),
            };
        });
    }

    getFeature(featureName) {
        return this._features[featureName];
    }
}
export class BrowserStats {
    // load the Browser stats, returns a promise.
    static load(type) {
        return fetch('assets/data/data.json')
            .then(response => response.json())
            .then(data => {
                const browsers = new Browsers();
                const validAgents = {};
                for (const a in data.agents) {
                    if (type == 'all' || type == data.agents[a].type) {
                        browsers.addBrowser(a, data.agents[a]);
                        validAgents[a] = true;
                    }
                }

                for (const i in data.data) {
                    // Remove agents that are not part of the viewed set.
                    const feature = data.data[i];
                    for (const a in feature.stats) {
                        if (!!validAgents[a] == false) {
                            feature.stats[a] = undefined;
                        }
                    }
                    browsers.addFeature(i, feature);
                }

                return browsers;
            });
    }
}
