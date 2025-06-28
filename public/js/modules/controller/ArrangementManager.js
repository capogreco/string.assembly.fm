class ArrangementManager {
    constructor() {
        this.strategies = {
            'round-robin': this.distributeRoundRobin.bind(this),
            'balanced': this.distributeBalanced.bind(this),
            'randomized-balanced': this.distributeRandomizedBalanced.bind(this),
            'weighted': this.distributeWeighted.bind(this),
            'ensemble': this.distributeEnsemble.bind(this)
        };

        this.defaultStochasticParams = {
            microDetuning: {
                enabled: true,
                type: 'normal',
                mean: 0,
                std: 3  // cents
            },
            octaveDoubling: {
                enabled: true,
                probability: 0.3,
                preferUp: true
            },
            dynamicVariation: {
                enabled: true,
                range: 0.2
            }
        };
    }

    distribute(parts, synthIds, options = {}) {
        const { strategy = 'balanced', stochasticParams = this.defaultStochasticParams, seed = null } = options;
        const random = seed ? this.createSeededRandom(seed) : Math.random;

        const baseAssignments = this.strategies[strategy](parts, synthIds, { random, ...options });

        const finalAssignments = this.applyStochasticVariations(baseAssignments, stochasticParams, random);

        return finalAssignments;
    }

    distributeRoundRobin(parts, synthIds, options) {
        const assignments = [];
        for (let i = 0; i < synthIds.length; i++) {
            const partIndex = i % parts.length;
            assignments.push({ synthId: synthIds[i], part: parts[partIndex], partIndex: partIndex });
        }
        return assignments;
    }

    distributeBalanced(parts, synthIds, options) {
        const assignments = [];
        const synthsPerPart = Math.floor(synthIds.length / parts.length);
        const remainder = synthIds.length % parts.length;
        let synthIndex = 0;

        for (let partIndex = 0; partIndex < parts.length; partIndex++) {
            const synthCount = synthsPerPart + (partIndex < remainder ? 1 : 0);
            for (let i = 0; i < synthCount; i++) {
                assignments.push({ synthId: synthIds[synthIndex], part: parts[partIndex], partIndex: partIndex });
                synthIndex++;
            }
        }
        return assignments;
    }

    distributeRandomizedBalanced(parts, synthIds, options) {
        const random = options.random || Math.random;
        const partAssignments = [];
        const synthsPerPart = Math.floor(synthIds.length / parts.length);
        const remainder = synthIds.length % parts.length;

        for (let partIndex = 0; partIndex < parts.length; partIndex++) {
            const synthCount = synthsPerPart + (partIndex < remainder ? 1 : 0);
            for (let i = 0; i < synthCount; i++) {
                partAssignments.push({ part: parts[partIndex], partIndex: partIndex });
            }
        }

        const shuffledSynthIds = [...synthIds];
        this.shuffleArray(shuffledSynthIds, random);

        const assignments = partAssignments.map((partAssignment, index) => ({
            synthId: shuffledSynthIds[index],
            part: partAssignment.part,
            partIndex: partAssignment.partIndex
        }));

        return assignments;
    }

    distributeWeighted(parts, synthIds, options) {
        const random = options.random || Math.random;
        const weights = parts.map(part => part.weight || 1.0);
        const totalWeight = weights.reduce((sum, w) => sum + w, 0);
        const normalizedWeights = weights.map(w => w / totalWeight);

        const assignments = [];
        for (const synthId of synthIds) {
            const partIndex = this.weightedChoice(normalizedWeights, random);
            assignments.push({ synthId: synthId, part: parts[partIndex], partIndex: partIndex });
        }
        return assignments;
    }

    distributeEnsemble(parts, synthIds, options) {
        const random = options.random || Math.random;
        const sectionSize = options.sectionSize || 3;
        const assignments = [];
        const sections = Math.ceil(synthIds.length / sectionSize);

        for (let section = 0; section < sections; section++) {
            const sectionStart = section * sectionSize;
            const sectionEnd = Math.min(sectionStart + sectionSize, synthIds.length);
            const primaryPartIndex = Math.floor(random() * parts.length);

            for (let i = sectionStart; i < sectionEnd; i++) {
                const usePrimary = random() < 0.7;
                const partIndex = usePrimary ? primaryPartIndex : Math.floor(random() * parts.length);
                assignments.push({ synthId: synthIds[i], part: parts[partIndex], partIndex: partIndex, section: section });
            }
        }
        return assignments;
    }

    applyStochasticVariations(assignments, params, random) {
        return assignments.map(assignment => {
            const resolvedPart = { ...assignment.part };

            for (const paramName in resolvedPart) {
                const paramValue = resolvedPart[paramName];
                if (paramValue && typeof paramValue === 'object' && paramValue.type) {
                    resolvedPart[paramName] = this.sampleDistribution(paramValue.type, paramValue, random);
                }
            }

            if (params.microDetuning?.enabled && resolvedPart.fundamentalFrequency) {
                const detuneCents = this.sampleDistribution('normal', params.microDetuning, random);
                resolvedPart.fundamentalFrequency *= Math.pow(2, detuneCents / 1200);
            }

            if (params.octaveDoubling?.enabled && random() < params.octaveDoubling.probability && resolvedPart.fundamentalFrequency) {
                const octaveShift = params.octaveDoubling.preferUp ? 1 : -1;
                resolvedPart.fundamentalFrequency *= Math.pow(2, octaveShift);
            }

            if (params.dynamicVariation?.enabled && resolvedPart.volume) {
                const variation = (random() - 0.5) * 2 * params.dynamicVariation.range;
                resolvedPart.volume *= (1 + variation);
            }

            return { synthId: assignment.synthId, resolvedPart };
        });
    }

    sampleDistribution(type, params, random) {
        switch (type) {
            case 'normal':
                const u1 = random();
                const u2 = random();
                const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
                return params.mean + z0 * params.std;
            case 'uniform':
                return params.min + random() * (params.max - params.min);
            default:
                return 0;
        }
    }

    weightedChoice(weights, random) {
        const r = random();
        let cumulative = 0;
        for (let i = 0; i < weights.length; i++) {
            cumulative += weights[i];
            if (r <= cumulative) {
                return i;
            }
        }
        return weights.length - 1;
    }

    createSeededRandom(seed) {
        let value = seed;
        return () => {
            value = (value * 9301 + 49297) % 233280;
            return value / 233280;
        };
    }

    shuffleArray(array, random = Math.random) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }
}

export { ArrangementManager };