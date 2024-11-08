function jsf32(seed: number[]) {
    let [a, b, c, d] = seed;
    return function (): number {
        a |= 0; b |= 0; c |= 0; d |= 0;
        let t = a - (b << 27 | b >>> 5) | 0;
        a = b ^ (c << 17 | c >>> 15);
        b = c + d | 0;
        c = d + t | 0;
        d = a + t | 0;
        return (d >>> 0) / 4294967296;
    }
}

export function makeSeed() {
    return [
        (Math.random() * 2 ** 32) >>> 0,
        (Math.random() * 2 ** 32) >>> 0,
        (Math.random() * 2 ** 32) >>> 0,
        (Math.random() * 2 ** 32) >>> 0,
    ];
}

export class Random {
    public getRand: () => number;

    constructor(seed: number[]) {
        this.getRand = jsf32(seed);
    }
}