export interface INodeTestSpec {
    nodeIndex: number;
    roundTime: number;
    numGenerationRounds: number;
    randomSeed: number[];
}

export interface ITestSpec {
    testId: string;
    testIndex: number;
    title: string;
    nodes: INodeTestSpec[];
}